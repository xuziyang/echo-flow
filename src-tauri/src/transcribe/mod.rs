// src-tauri/src/transcribe/mod.rs — Whisper 字幕生成模块
//
// 迁移自 whisperx-rs 的完整 pipeline:
//   audio.rs    — 音频加载 (FFmpeg)
//   vad.rs      — 语音活动检测 (Silero VAD)
//   asr.rs      — 语音识别 (Whisper)
//   aligner.rs  — 字符级对齐 (Wav2Vec2 CTC)
//   writer.rs   — SRT 文件生成
//   error.rs    — 错误类型定义
//   types.rs    — 数据结构定义

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::Emitter;

// 子模块
mod aligner;
mod asr;
mod audio;
mod error;
mod types;
mod vad;
mod writer;

// 重新导出公开 API
pub use aligner::{Aligner, AlignerConfig};
pub use asr::{Asr, AsrConfig};
pub use audio::Audio;
pub use error::SubtitleError;
pub use types::{FrontendTranscriptSegment, ProcessingResult};

// Re-export frontend-compatible types (旧接口保持兼容)
pub use types::{
    TranscribeDoneEvent, TranscribeErrorEvent, TranscribeProgressEvent,
};

static LAST_TRANSCRIBE_JOB_ID: AtomicU64 = AtomicU64::new(0);

const DEFAULT_MODEL_CACHE_DIR: &str = ".cache/echo-flow/models";

/// SubtitlePipeline - 完整的字幕生成 pipeline
#[derive(Debug, Default, Clone)]
pub struct SubtitlePipeline {
    audio: Audio,
    asr: Asr,
    aligner: Aligner,
}

impl SubtitlePipeline {
    pub fn with_config(
        whisper_model_path: PathBuf,
        vad_model_path: PathBuf,
        align_model_path: PathBuf,
        align_vocab_path: PathBuf,
    ) -> Self {
        Self {
            audio: Audio::new(),
            asr: Asr::with_config(AsrConfig {
                vad_model_path,
                whisper_model_path,
                chunk_size_secs: 30.0,
                vad_threshold: 0.5,
            }),
            aligner: Aligner::with_config(AlignerConfig {
                model_path: align_model_path,
                vocab_path: align_vocab_path,
            }),
        }
    }

    pub fn process_with_progress<F>(&self, input: &Path, mut progress: F) -> Result<ProcessingResult, SubtitleError>
    where
        F: FnMut(&str, f32),
    {
        progress("Loading audio", 0.0);
        let audio = self.audio.load(input)?;
        progress("Audio loaded", 10.0);

        progress("Detecting voice segments", 10.0);
        let transcript = self.asr.recognize(&audio)?;
        progress("Transcription complete", 50.0);

        progress("Aligning with Wav2Vec2", 50.0);
        let subtitles = self.aligner.align(&audio, &transcript)?;
        progress("Alignment complete", 100.0);

        Ok(ProcessingResult {
            audio,
            transcript,
            subtitles,
        })
    }
}

fn resolve_model_path(
    user_provided: Option<&str>,
    default_paths: &[String],
) -> Result<PathBuf, String> {
    if let Some(path) = user_provided {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
        return Err(format!("Model not found at: {}", path));
    }

    for path in default_paths {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
    }

    Err("No valid model path found".to_string())
}

/// 转写音频文件，返回带时间戳的字幕
#[tauri::command]
pub fn transcribe_audio(
    window: tauri::Window,
    audio_path: String,
    model_path: Option<String>,
    model_dir: Option<String>,
    job_id: Option<u64>,
) -> Result<u64, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let cache_dir = match model_dir {
        Some(ref dir) if !dir.is_empty() => {
            PathBuf::from(if dir.starts_with('~') {
                dir.replacen('~', &home, 1)
            } else {
                dir.clone()
            })
        }
        _ => PathBuf::from(format!("{}/{}", home, DEFAULT_MODEL_CACHE_DIR)),
    };

    // 解析 Whisper 模型路径
    let whisper_model = resolve_model_path(model_path.as_deref(), &[
        cache_dir.join("ggml-base.en.bin").to_string_lossy().into_owned(),
        cache_dir.join("ggml-small.en.bin").to_string_lossy().into_owned(),
        "./models/ggml-base.en.bin".to_string(),
        "./models/ggml-small.en.bin".to_string(),
        format!("{}/.cache/whisper/ggml-base.en.bin", home),
        format!("{}/.cache/whisper/ggml-small.en.bin", home),
    ])?;

    // VAD 模型路径
    let vad_model = resolve_model_path(None, &[
        cache_dir.join("silero_vad.onnx").to_string_lossy().into_owned(),
        "./models/silero_vad.onnx".to_string(),
        format!("{}/.cargo/registry/src/*/whisperx-rs-*/models/silero_vad.onnx", home),
    ])?;

    // Wav2Vec2 模型路径
    let align_model = resolve_model_path(None, &[
        cache_dir.join("wav2vec2-base-en.onnx").to_string_lossy().into_owned(),
        "./models/wav2vec2-base-en.onnx".to_string(),
        format!("{}/.cargo/registry/src/*/whisperx-rs-*/models/wav2vec2-base-en.onnx", home),
    ])?;

    // Wav2Vec2 vocab 路径
    let align_vocab = resolve_model_path(None, &[
        cache_dir.join("wav2vec2-vocab.json").to_string_lossy().into_owned(),
        "./models/wav2vec2-vocab.json".to_string(),
        format!("{}/.cargo/registry/src/*/whisperx-rs-*/models/wav2vec2-vocab.json", home),
    ])?;

    log::info!(
        "Starting transcription: audio={}, whisper={}, vad={}, align={}",
        audio_path,
        whisper_model.display(),
        vad_model.display(),
        align_model.display()
    );

    let resolved_job_id =
        job_id.unwrap_or_else(|| LAST_TRANSCRIBE_JOB_ID.fetch_add(1, Ordering::Relaxed) + 1);
    let audio_path_clone = audio_path.clone();
    let window_clone = window.clone();

    std::thread::spawn(move || {
        let progress_audio_path = audio_path_clone.clone();

        let pipeline = SubtitlePipeline::with_config(
            whisper_model,
            vad_model,
            align_model,
            align_vocab,
        );

        let result = pipeline.process_with_progress(Path::new(&audio_path_clone), |stage, percent| {
            let _ = window_clone.emit(
                "transcribe-progress",
                TranscribeProgressEvent {
                    job_id: resolved_job_id,
                    audio_path: progress_audio_path.clone(),
                    percent,
                    sentence: stage.to_string(),
                    done: false,
                },
            );
        });

        match result {
            Ok(result) => {
                // 转换为前端兼容的格式
                let segments: Vec<FrontendTranscriptSegment> = result.subtitles.iter().map(|s| FrontendTranscriptSegment {
                    id: s.index as i64,
                    en: s.text.clone(),
                    start_ms: s.start_ms as i64,
                    end_ms: s.end_ms as i64,
                    words: Vec::new(),
                }).collect();

                // 保存 SRT 文件
                let source = Path::new(&audio_path_clone);
                let parent = source.parent().unwrap_or_else(|| Path::new("."));
                let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("transcript");
                let srt_path = parent.join(format!("{}.srt", stem));

                match std::fs::File::create(&srt_path) {
                    Ok(file) => {
                        if let Err(e) = writer::write_srt(&result.subtitles, file) {
                            eprintln!("Failed to write SRT: {}", e);
                        }
                    }
                    Err(e) => eprintln!("Failed to create SRT file: {}", e),
                }

                eprintln!(
                    "Transcription complete: {} segments, saved to {}",
                    segments.len(),
                    srt_path.display()
                );

                let _ = window_clone.emit(
                    "transcribe-done",
                    TranscribeDoneEvent {
                        job_id: resolved_job_id,
                        audio_path: audio_path_clone.clone(),
                        segments,
                    },
                );
            }
            Err(e) => {
                eprintln!("Transcription failed: {}", e);
                let _ = window_clone.emit(
                    "transcribe-error",
                    TranscribeErrorEvent {
                        job_id: resolved_job_id,
                        audio_path: audio_path_clone.clone(),
                        error: e.to_string(),
                    },
                );
            }
        }
    });

    Ok(resolved_job_id)
}

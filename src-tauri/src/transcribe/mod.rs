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

use tauri::{Emitter, Manager};

// 子模块
mod aligner;
mod asr;
mod audio;
mod cache;
mod error;
mod types;
mod vad;
mod writer;

// 重新导出公开 API
pub use aligner::{Aligner, AlignerConfig};
pub use asr::{Asr, AsrConfig};
pub use audio::Audio;
pub use error::SubtitleError;
pub use types::{
    CacheSubtitleEntry, FrontendTranscriptSegment, ProcessingResult, SplitAlignmentResult,
};

// Re-export frontend-compatible types (旧接口保持兼容)
pub use types::{TranscribeDoneEvent, TranscribeErrorEvent, TranscribeProgressEvent};

static LAST_TRANSCRIBE_JOB_ID: AtomicU64 = AtomicU64::new(0);

const DEFAULT_MODEL_CACHE_DIR: &str = ".cache/echo-flow/models";
const DEFAULT_WHISPER_MODELS: [&str; 4] = [
    "ggml-base.en.bin",
    "ggml-small.en.bin",
    "ggml-medium.en.bin",
    "ggml-tiny.en.bin",
];

fn resolve_model_cache_dir(model_dir: Option<&str>) -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    match model_dir {
        Some(dir) if !dir.is_empty() => PathBuf::from(if dir.starts_with('~') {
            dir.replacen('~', &home, 1)
        } else {
            dir.to_owned()
        }),
        _ => PathBuf::from(format!("{}/{}", home, DEFAULT_MODEL_CACHE_DIR)),
    }
}

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

    pub fn process_with_progress<F>(
        &self,
        input: &Path,
        mut progress: F,
    ) -> Result<ProcessingResult, SubtitleError>
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

fn resolve_model_path(path: &PathBuf, model_name: &str) -> Result<PathBuf, String> {
    if path.exists() {
        Ok(path.clone())
    } else {
        Err(format!("{} not found at {}", model_name, path.display()))
    }
}

fn resolve_first_model_path(paths: &[PathBuf], model_name: &str) -> Result<PathBuf, String> {
    paths
        .iter()
        .find(|path| path.exists())
        .cloned()
        .ok_or_else(|| {
            let expected = paths
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            format!("{} not found. Expected one of: {}", model_name, expected)
        })
}

fn resolve_transcription_model_paths(
    model_path: Option<&str>,
    whisper_model: Option<&str>,
    model_dir: Option<&str>,
) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let cache_dir = resolve_model_cache_dir(model_dir);
    let whisper_model = match model_path {
        Some(p) => resolve_model_path(&PathBuf::from(p), "Whisper model")?,
        None if whisper_model.is_some() => {
            let filename = whisper_model_filename(whisper_model.unwrap())?;
            resolve_model_path(&cache_dir.join(filename), "Whisper model")?
        }
        None => {
            let paths = DEFAULT_WHISPER_MODELS
                .iter()
                .map(|filename| cache_dir.join(filename))
                .collect::<Vec<_>>();
            resolve_first_model_path(&paths, "Whisper model")?
        }
    };
    let vad_model = resolve_model_path(&cache_dir.join("silero_vad.onnx"), "VAD model")?;
    let align_model =
        resolve_model_path(&cache_dir.join("wav2vec2-base-en.onnx"), "Aligner model")?;
    let align_vocab = resolve_model_path(&cache_dir.join("wav2vec2-vocab.json"), "Aligner vocab")?;

    Ok((whisper_model, vad_model, align_model, align_vocab))
}

fn transcription_cache_paths_for_audio(
    app: &tauri::AppHandle,
    audio_path: &str,
    whisper_model: &Path,
    vad_model: &Path,
    align_model: &Path,
    align_vocab: &Path,
) -> Result<cache::TranscriptionCachePaths, String> {
    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {}", error))?;
    let source_hash = cache::sha256_file(Path::new(audio_path))
        .map_err(|error| format!("Failed to hash input file for cache: {}", error))?;
    let whisper_identity = cache::model_identity(whisper_model)
        .map_err(|error| format!("Failed to inspect Whisper model for cache: {}", error))?;
    let vad_identity = cache::model_identity(vad_model)
        .map_err(|error| format!("Failed to inspect VAD model for cache: {}", error))?;
    let align_identity = cache::model_identity(align_model)
        .map_err(|error| format!("Failed to inspect alignment model for cache: {}", error))?;
    let vocab_identity = cache::model_identity(align_vocab)
        .map_err(|error| format!("Failed to inspect alignment vocab for cache: {}", error))?;
    let cache_key = cache::cache_key(
        &source_hash,
        &whisper_identity,
        &vad_identity,
        &align_identity,
        &vocab_identity,
    );

    Ok(cache::cache_paths(&app_cache_dir, &cache_key))
}

/// 转写音频文件，返回带时间戳的字幕
#[tauri::command]
pub fn transcribe_audio(
    window: tauri::Window,
    app: tauri::AppHandle,
    audio_path: String,
    model_path: Option<String>,
    whisper_model: Option<String>,
    model_dir: Option<String>,
    job_id: Option<u64>,
    force_regenerate: Option<bool>,
) -> Result<u64, String> {
    let (whisper_model, vad_model, align_model, align_vocab) = resolve_transcription_model_paths(
        model_path.as_deref(),
        whisper_model.as_deref(),
        model_dir.as_deref(),
    )?;
    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {}", error))?;

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
        let source_path = PathBuf::from(&audio_path_clone);
        let whisper_identity = match cache::model_identity(&whisper_model) {
            Ok(identity) => identity,
            Err(error) => {
                emit_transcribe_error(
                    &window_clone,
                    resolved_job_id,
                    &audio_path_clone,
                    format!("Failed to inspect Whisper model for cache: {}", error),
                );
                return;
            }
        };
        let vad_identity = match cache::model_identity(&vad_model) {
            Ok(identity) => identity,
            Err(error) => {
                emit_transcribe_error(
                    &window_clone,
                    resolved_job_id,
                    &audio_path_clone,
                    format!("Failed to inspect VAD model for cache: {}", error),
                );
                return;
            }
        };
        let align_identity = match cache::model_identity(&align_model) {
            Ok(identity) => identity,
            Err(error) => {
                emit_transcribe_error(
                    &window_clone,
                    resolved_job_id,
                    &audio_path_clone,
                    format!("Failed to inspect alignment model for cache: {}", error),
                );
                return;
            }
        };
        let vocab_identity = match cache::model_identity(&align_vocab) {
            Ok(identity) => identity,
            Err(error) => {
                emit_transcribe_error(
                    &window_clone,
                    resolved_job_id,
                    &audio_path_clone,
                    format!("Failed to inspect alignment vocab for cache: {}", error),
                );
                return;
            }
        };
        let source_hash = match cache::sha256_file(&source_path) {
            Ok(hash) => hash,
            Err(error) => {
                emit_transcribe_error(
                    &window_clone,
                    resolved_job_id,
                    &audio_path_clone,
                    format!("Failed to hash input file for cache: {}", error),
                );
                return;
            }
        };
        let cache_key = cache::cache_key(
            &source_hash,
            &whisper_identity,
            &vad_identity,
            &align_identity,
            &vocab_identity,
        );
        let cache_paths = cache::cache_paths(&app_cache_dir, &cache_key);

        if should_read_cached_transcription(force_regenerate, cache_paths.subtitles_srt.exists()) {
            match cache::read_cached_segments(&cache_paths) {
                Ok(segments) => {
                    log::info!(
                        "Using cached transcription: audio={}, cache={}",
                        audio_path_clone,
                        cache_paths.entry_dir.display()
                    );
                    let _ = window_clone.emit(
                        "transcribe-progress",
                        TranscribeProgressEvent {
                            job_id: resolved_job_id,
                            audio_path: audio_path_clone.clone(),
                            percent: 100.0,
                            sentence: "Loading cached subtitles".to_string(),
                            done: false,
                        },
                    );
                    let _ = window_clone.emit(
                        "transcribe-done",
                        TranscribeDoneEvent {
                            job_id: resolved_job_id,
                            audio_path: audio_path_clone.clone(),
                            segments,
                        },
                    );
                    return;
                }
                Err(error) => {
                    log::warn!(
                        "Ignoring invalid cached subtitles at {}: {}",
                        cache_paths.subtitles_srt.display(),
                        error
                    );
                }
            }
        }

        let pipeline =
            SubtitlePipeline::with_config(whisper_model, vad_model, align_model, align_vocab);

        let result =
            pipeline.process_with_progress(Path::new(&audio_path_clone), |stage, percent| {
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
                let segments: Vec<FrontendTranscriptSegment> = result
                    .subtitles
                    .iter()
                    .map(|s| FrontendTranscriptSegment {
                        id: s.index as i64,
                        en: s.text.clone(),
                        start_ms: s.start_ms as i64,
                        end_ms: s.end_ms as i64,
                        words: Vec::new(),
                    })
                    .collect();

                // 保存 SRT 文件
                let source = Path::new(&audio_path_clone);
                let parent = source.parent().unwrap_or_else(|| Path::new("."));
                let stem = source
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("transcript");
                let srt_path = parent.join(format!("{}.srt", stem));

                match std::fs::File::create(&srt_path) {
                    Ok(file) => {
                        if let Err(e) = writer::write_srt(&result.subtitles, file) {
                            eprintln!("Failed to write SRT: {}", e);
                        }
                    }
                    Err(e) => eprintln!("Failed to create SRT file: {}", e),
                }

                let metadata = cache::TranscriptionCacheMetadata {
                    schema_version: cache::CACHE_SCHEMA_VERSION,
                    source_name: cache::source_name(source),
                    source_size: cache::source_size(source).unwrap_or(0),
                    source_hash,
                    whisper_model: whisper_identity,
                    vad_model: vad_identity,
                    align_model: align_identity,
                    align_vocab: vocab_identity,
                    created_at_unix_secs: cache::unix_now_secs(),
                };
                if let Err(error) = cache::write_cache_entry(
                    &cache_paths,
                    &result.audio,
                    &result.subtitles,
                    &metadata,
                ) {
                    log::warn!(
                        "Failed to write transcription cache at {}: {}",
                        cache_paths.entry_dir.display(),
                        error
                    );
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

#[tauri::command]
pub fn align_split_sentence(
    audio_path: String,
    start_ms: i64,
    end_ms: i64,
    left_text: String,
    right_text: String,
    model_dir: Option<String>,
) -> Result<SplitAlignmentResult, String> {
    if start_ms < 0 || end_ms <= start_ms + 1 {
        return Err(format!(
            "Invalid split alignment range: {}..{}",
            start_ms, end_ms
        ));
    }

    let cache_dir = resolve_model_cache_dir(model_dir.as_deref());
    let align_model =
        resolve_model_path(&cache_dir.join("wav2vec2-base-en.onnx"), "Aligner model")?;
    let align_vocab = resolve_model_path(&cache_dir.join("wav2vec2-vocab.json"), "Aligner vocab")?;
    let audio = Audio::new()
        .load(Path::new(&audio_path))
        .map_err(|error| error.to_string())?;
    let aligner = Aligner::with_config(AlignerConfig {
        model_path: align_model,
        vocab_path: align_vocab,
    });

    aligner
        .align_split(
            &audio,
            start_ms as u64,
            end_ms as u64,
            &left_text,
            &right_text,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_transcription_cache_subtitles(
    app: tauri::AppHandle,
    audio_path: String,
    entries: Vec<CacheSubtitleEntry>,
    model_path: Option<String>,
    whisper_model: Option<String>,
    model_dir: Option<String>,
) -> Result<(), String> {
    let (whisper_model_path, vad_model, align_model, align_vocab) =
        resolve_transcription_model_paths(
            model_path.as_deref(),
            whisper_model.as_deref(),
            model_dir.as_deref(),
        )?;
    let cache_paths = transcription_cache_paths_for_audio(
        &app,
        &audio_path,
        &whisper_model_path,
        &vad_model,
        &align_model,
        &align_vocab,
    )?;
    cache::write_cached_subtitles(&cache_paths, &entries)
        .map_err(|error| format!("Failed to write cached subtitles: {}", error))
}

#[tauri::command]
pub fn get_app_cache_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {}", error))?;
    std::fs::create_dir_all(&app_cache_dir)
        .map_err(|error| format!("Failed to create app cache dir: {}", error))?;
    Ok(app_cache_dir.display().to_string())
}

#[tauri::command]
pub fn get_transcription_cache_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {}", error))?;
    let cache_dir = app_cache_dir.join("transcripts");
    std::fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Failed to create transcription cache dir: {}", error))?;
    Ok(cache_dir.display().to_string())
}

#[tauri::command]
pub fn get_recording_cache_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {}", error))?;
    let cache_dir = app_cache_dir.join("recordings");
    std::fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Failed to create recording cache dir: {}", error))?;
    Ok(cache_dir.display().to_string())
}

#[tauri::command]
pub fn delete_recordings_for_audio(
    app: tauri::AppHandle,
    audio_path: String,
) -> Result<(), String> {
    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {}", error))?;
    let recording_dir = recording_cache_dir_for_audio(&app_cache_dir, &audio_path);

    if recording_dir.exists() {
        std::fs::remove_dir_all(&recording_dir).map_err(|error| {
            format!(
                "Failed to delete recordings at {}: {}",
                recording_dir.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn recording_cache_dir_for_audio(app_cache_dir: &Path, audio_path: &str) -> PathBuf {
    app_cache_dir
        .join("recordings")
        .join(recording_path_stem(audio_path))
}

fn recording_path_stem(audio_path: &str) -> String {
    let file_name = Path::new(audio_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("audio");
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(file_name);

    sanitize_recording_path_segment(stem)
}

fn sanitize_recording_path_segment(segment: &str) -> String {
    let mut output = String::new();
    let mut previous_was_space = false;

    for ch in segment.trim().chars() {
        let mapped = if ch.is_control()
            || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        {
            '-'
        } else if ch.is_whitespace() {
            ' '
        } else {
            ch
        };

        if mapped == ' ' {
            if previous_was_space {
                continue;
            }
            previous_was_space = true;
        } else {
            previous_was_space = false;
        }

        if output.chars().count() < 80 {
            output.push(mapped);
        }
    }

    if output.is_empty() || output.chars().all(|ch| ch == '.') {
        "audio".to_owned()
    } else {
        output
    }
}

fn emit_transcribe_error(window: &tauri::Window, job_id: u64, audio_path: &str, error: String) {
    eprintln!("Transcription failed: {}", error);
    let _ = window.emit(
        "transcribe-error",
        TranscribeErrorEvent {
            job_id,
            audio_path: audio_path.to_owned(),
            error,
        },
    );
}

fn should_read_cached_transcription(
    force_regenerate: Option<bool>,
    subtitles_exist: bool,
) -> bool {
    subtitles_exist && !force_regenerate.unwrap_or(false)
}

fn whisper_model_filename(model: &str) -> Result<&'static str, String> {
    match model {
        "whisper-tiny" => Ok("ggml-tiny.en.bin"),
        "whisper-base" => Ok("ggml-base.en.bin"),
        "whisper-small" => Ok("ggml-small.en.bin"),
        "whisper-medium" => Ok("ggml-medium.en.bin"),
        other => Err(format!("Unsupported Whisper model: {}", other)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_cache_by_default_when_subtitles_exist() {
        assert!(should_read_cached_transcription(None, true));
        assert!(should_read_cached_transcription(Some(false), true));
    }

    #[test]
    fn skips_cache_when_force_regenerating() {
        assert!(!should_read_cached_transcription(Some(true), true));
    }

    #[test]
    fn skips_cache_when_subtitles_are_missing() {
        assert!(!should_read_cached_transcription(None, false));
    }

    #[test]
    fn resolves_recording_directory_from_audio_stem() {
        let base = Path::new("/tmp/app-cache");

        assert_eq!(
            recording_cache_dir_for_audio(base, "/tmp/lesson audio.mp3"),
            PathBuf::from("/tmp/app-cache").join("recordings").join("lesson audio")
        );
    }

    #[test]
    fn sanitizes_recording_directory_stems_like_frontend() {
        assert_eq!(
            recording_path_stem("bad:name?.wav"),
            "bad-name-"
        );
        assert_eq!(recording_path_stem("..."), "audio");
    }
}

// src-tauri/src/transcribe/mod.rs — Whisper transcription 主模块
//
// 拆分说明:
//   types.rs         — 数据结构定义
//   audio.rs         — 音频预处理与采样加载
//   srt.rs           — SRT 时间格式与文件写入
//   normalization.rs — 文本规范化与词匹配
//   word_stream.rs   — 词流构建与句子对齐
//   whisper.rs       — Whisper 模型调用

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::Emitter;

// 子模块
mod audio;
mod normalization;
mod srt;
mod types;
mod whisper;
mod word_stream;

// Re-export 公开 API，保持外部调用方 (lib.rs, 前端) 无感知变化
pub use types::{
    RawTranscriptSegment, TranscribeDoneEvent, TranscribeErrorEvent, TranscribeProgressEvent,
    TranscriptSegment,
};
pub use srt::write_srt_file;
pub use word_stream::{
    build_transcript_segments_from_whisper, raw_segments_to_transcript_segments,
};

static LAST_TRANSCRIBE_JOB_ID: AtomicU64 = AtomicU64::new(0);

fn build_transcript_output_paths(audio_path: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let source = Path::new(audio_path);
    let parent = source.parent().unwrap_or_else(|| Path::new("."));
    let stem = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .unwrap_or("transcript");

    (
        parent.join(format!("{}.whisper.raw.srt", stem)),
        parent.join(format!("{}.whisper.segmented.srt", stem)),
    )
}

fn persist_transcripts(
    audio_path: &str,
    whisper_segments: &[RawTranscriptSegment],
    segmented: &[TranscriptSegment],
) -> Result<(), String> {
    let raw_segments = raw_segments_to_transcript_segments(whisper_segments);
    let (raw_path, segmented_path) = build_transcript_output_paths(audio_path);

    write_srt_file(&raw_path, &raw_segments)?;
    write_srt_file(&segmented_path, segmented)?;

    eprintln!(
        "Saved transcripts: raw={}, segmented={}",
        raw_path.display(),
        segmented_path.display()
    );

    Ok(())
}

/// 转写音频文件，返回带时间戳的字幕
#[tauri::command]
pub fn transcribe_audio(
    window: tauri::Window,
    audio_path: String,
    model_path: Option<String>,
    job_id: Option<u64>,
) -> Result<u64, String> {
    // 查找 Whisper 模型
    let model = model_path.unwrap_or_else(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        [
            format!("{}/.cache/whisper/ggml-small.en.bin", home),
            format!("{}/.cache/whisper/ggml-base.en.bin", home),
            format!("{}/.cache/whisper/ggml-base.bin", home),
            "./models/ggml-small.en.bin".to_string(),
            "./models/ggml-base.en.bin".to_string(),
            "./ggml-small.en.bin".to_string(),
            "./ggml-base.en.bin".to_string(),
        ]
        .into_iter()
        .find(|p| Path::new(p).exists())
        .unwrap_or_default()
    });

    if model.is_empty() {
        return Err(
            "未找到 Whisper 模型文件。请下载模型并指定路径，或将模型放置在 ~/.cache/whisper/ 目录下。"
                .to_string(),
        );
    }

    log::info!(
        "Starting transcription: audio={}, model={}",
        audio_path,
        model
    );

    let resolved_job_id =
        job_id.unwrap_or_else(|| LAST_TRANSCRIBE_JOB_ID.fetch_add(1, Ordering::Relaxed) + 1);
    let audio_path_clone = audio_path.clone();
    let model_clone = model.clone();
    let window_clone = window.clone();

    std::thread::spawn(move || {
        let progress_audio_path = audio_path_clone.clone();
        let result = whisper::run_whisper(
            &audio_path_clone,
            &model_clone,
            |percent, sentence| {
                let _ = window_clone.emit(
                    "transcribe-progress",
                    TranscribeProgressEvent {
                        job_id: resolved_job_id,
                        audio_path: progress_audio_path.clone(),
                        percent,
                        sentence: sentence.to_string(),
                        done: false,
                    },
                );
            },
        );

        match result {
            Ok(whisper_segments) => {
                let segments = build_transcript_segments_from_whisper(&whisper_segments);
                if let Err(error) =
                    persist_transcripts(&audio_path_clone, &whisper_segments, &segments)
                {
                    eprintln!("Persist transcripts failed: {}", error);
                }
                eprintln!(
                    "Emitting transcribe-done: job_id={}, audio_path={}, whisper_segments={}, transcript_segments={}",
                    resolved_job_id,
                    audio_path_clone,
                    whisper_segments.len(),
                    segments.len()
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
                let _ = window_clone.emit(
                    "transcribe-error",
                    TranscribeErrorEvent {
                        job_id: resolved_job_id,
                        audio_path: audio_path_clone.clone(),
                        error: e,
                    },
                );
            }
        }
    });

    Ok(resolved_job_id)
}

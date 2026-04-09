// src-tauri/src/transcribe.rs — Whisper transcription + nnn-split sentence boundary detection
use log::info;
use nnsplit::NNSplit;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::Emitter;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// 转写进度事件
#[derive(Debug, Clone, Serialize)]
pub struct TranscribeProgress {
    pub percent: f32,
    pub sentence: String,
    pub done: bool,
}

/// 转写后的字幕条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: i64,
    pub en: String,
    pub zh: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

/// Whisper 转写结果片段
#[derive(Debug)]
struct WhisperSegment {
    pub text: String,
    #[allow(dead_code)]
    pub start_ms: i64,
    pub end_ms: i64,
}

/// 运行 Whisper 转写（调用方提供模型路径）
fn run_whisper(
    audio_path: &str,
    model_path: &str,
    progress_callback: impl Fn(f32, &str),
) -> Result<Vec<WhisperSegment>, String> {
    let ctx = WhisperContext::new_with_params(
        model_path,
        WhisperContextParameters::default(),
    ).map_err(|e| format!("无法加载 Whisper 模型: {}", e))?;

    let mut state = ctx.create_state()
        .map_err(|e| format!("无法创建 Whisper 状态: {}", e))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });
    params.set_language(Some("en"));
    params.set_print_progress(false);

    // 如果不是 WAV，先用 ffmpeg 转换
    let audio_file = Path::new(audio_path);
    let wav_path = if audio_file.extension().and_then(|e| e.to_str()) == Some("wav") {
        audio_path.to_string()
    } else {
        let output = Command::new("ffmpeg")
            .args(["-y", "-i", audio_path, "-ar", "16000", "-ac", "1", "/tmp/whisper_input.wav"])
            .output()
            .map_err(|e| format!("调用 ffmpeg 失败: {}", e))?;
        if !output.status.success() {
            return Err(format!("ffmpeg 转换失败: {}", String::from_utf8_lossy(&output.stderr)));
        }
        "/tmp/whisper_input.wav".to_string()
    };

    let mut reader = hound::WavReader::open(&wav_path)
        .map_err(|e| format!("无法读取 WAV 文件: {}", e))?;
    let spec = reader.spec();
    let samples: Vec<f32> = reader.samples::<i16>()
        .filter_map(|s| s.ok())
        .map(|s| s as f32 / 32768.0)
        .collect();

    // 降混音为单声道（如需要）
    let audio: Vec<f32> = if spec.channels == 2 {
        samples.chunks(2).map(|chunk| {
            let l = chunk.get(0).copied().unwrap_or(0.0);
            let r = chunk.get(1).copied().unwrap_or(0.0);
            (l + r) / 2.0
        }).collect()
    } else {
        samples
    };

    info!("Whisper: {} samples at {} Hz, {} channels", audio.len(), spec.sample_rate, spec.channels);

    state.full(params, &audio)
        .map_err(|e| format!("Whisper 推理失败: {}", e))?;

    let n_segments = state.full_n_segments() as usize;
    let mut segments = Vec::new();

    for i in 0..n_segments {
        let Some(seg) = state.get_segment(i as i32) else { continue };
        let txt = seg.to_str()
            .map(|s| s.trim().to_string())
            .unwrap_or_default();

        if txt.is_empty() {
            continue;
        }

        // Whisper 时间戳单位是厘秒（1/100秒）→ 毫秒
        let start_ms = seg.start_timestamp() / 10;
        let end_ms = seg.end_timestamp() / 10;

        let percent = ((i + 1) as f32 / n_segments as f32) * 100.0;
        progress_callback(percent, &txt);

        segments.push(WhisperSegment { text: txt, start_ms, end_ms });
    }

    Ok(segments)
}

/// 使用 nnn-split 做句子边界检测
fn split_sentences(text: &str) -> Vec<String> {
    // 模型路径：优先使用本地模型文件
    let model_home = std::env::var("HOME").unwrap_or_default();
    let model_paths = [
        format!("{}/.cache/nnsplit/model.onnx", model_home),
        "./models/nnsplit.onnx".to_string(),
        "./nnsplit.onnx".to_string(),
    ];
    let model_path = model_paths.iter()
        .find(|p| Path::new(p).exists())
        .cloned();

    match model_path {
        Some(path) => {
            match NNSplit::new(&path, Default::default()) {
                Ok(splitter) => {
                    let texts: Vec<&str> = vec![text];
                    let splits = splitter.split(&texts);
                    splits[0].iter()
                        .map(|s| s.text().to_string())
                        .collect()
                }
                Err(_) => fallback_split(text),
            }
        }
        None => fallback_split(text),
    }
}

/// 简单 fallback 断句：按标点符号分割
fn fallback_split(text: &str) -> Vec<String> {
    text.split(|c| c == '.' || c == '?' || c == '!' || c == '\n')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// 转写音频文件，返回带时间戳的字幕
#[tauri::command]
pub fn transcribe_audio(
    window: tauri::Window,
    audio_path: String,
    model_path: Option<String>,
) -> Result<(), String> {
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
        return Err("未找到 Whisper 模型文件。请下载模型并指定路径，或将模型放置在 ~/.cache/whisper/ 目录下。".to_string());
    }

    info!("Starting transcription: audio={}, model={}", audio_path, model);

    let audio_path_clone = audio_path.clone();
    let model_clone = model.clone();
    let window_clone = window.clone();

    std::thread::spawn(move || {
        let result = run_whisper(
            &audio_path_clone,
            &model_clone,
            |percent, sentence| {
                let _ = window_clone.emit("transcribe-progress", TranscribeProgress {
                    percent,
                    sentence: sentence.to_string(),
                    done: false,
                });
            },
        );

        match result {
            Ok(whisper_segments) => {
                let full_text: String = whisper_segments.iter()
                    .map(|s| s.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");

                let sentences = split_sentences(&full_text);
                let total_duration = whisper_segments.last()
                    .map(|s| s.end_ms)
                    .unwrap_or(0);

                let n = sentences.len().max(1) as i64;
                let segments: Vec<TranscriptSegment> = sentences
                    .into_iter()
                    .enumerate()
                    .map(|(idx, text)| {
                        let start_ms = (idx as i64 * total_duration) / n;
                        let end_ms = ((idx as i64 + 1) * total_duration) / n;
                        TranscriptSegment {
                            id: (idx + 1) as i64,
                            en: text,
                            zh: String::new(),
                            start_ms,
                            end_ms,
                        }
                    })
                    .collect();

                let _ = window_clone.emit("transcribe-done", &segments);
            }
            Err(e) => {
                let _ = window_clone.emit("transcribe-error", e);
            }
        }
    });

    Ok(())
}

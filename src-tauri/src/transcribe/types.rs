// src-tauri/src/transcribe/types.rs — 所有数据结构定义
use serde::{Deserialize, Serialize};

pub const DEFAULT_LANGUAGE: &str = "en";

/// 音频样本数据
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AudioSamples {
    pub sample_rate: u32,
    pub channels: u16,
    pub samples: Vec<f32>,
    pub source_path: String,
}

pub(crate) fn validate_audio(audio: &AudioSamples, sample_rate: u32) -> Result<(), super::error::SubtitleError> {
    if audio.sample_rate != sample_rate || audio.channels != 1 {
        return Err(super::error::SubtitleError::InvalidAudioFormat {
            sample_rate: audio.sample_rate,
            channels: audio.channels,
        });
    }
    Ok(())
}

pub(crate) fn ms_to_sample(ms: u64, sample_rate: u32) -> usize {
    ((ms as u128 * sample_rate as u128) / 1_000) as usize
}

pub(crate) fn samples_to_ms(samples: usize, sample_rate: u32) -> u64 {
    ((samples as u128 * 1_000) / sample_rate as u128) as u64
}

/// 转写片段（内部使用）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: usize,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// 转写结果
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transcript {
    pub language: Option<String>,
    pub segments: Vec<TranscriptSegment>,
}

/// 字幕条目
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Subtitle {
    pub index: usize,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// 处理结果
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProcessingResult {
    pub audio: AudioSamples,
    pub transcript: Transcript,
    pub subtitles: Vec<Subtitle>,
}

// ============================================================================
// 前端兼容类型（保持原有接口不变）
// ============================================================================

/// Whisper 转写进度事件
#[derive(Debug, Clone, Serialize)]
pub struct TranscribeProgressEvent {
    pub job_id: u64,
    pub audio_path: String,
    pub percent: f32,
    pub sentence: String,
    pub done: bool,
}

/// Whisper 转写完成事件
#[derive(Debug, Clone, Serialize)]
pub struct TranscribeDoneEvent {
    pub job_id: u64,
    pub audio_path: String,
    pub segments: Vec<FrontendTranscriptSegment>,
}

/// 前端转写片段格式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontendTranscriptSegment {
    pub id: i64,
    pub en: String,
    pub start_ms: i64,
    pub end_ms: i64,
    /// 词级时间戳（可选）
    #[serde(default)]
    pub words: Vec<WordToken>,
}

/// Whisper 转写错误事件
#[derive(Debug, Clone, Serialize)]
pub struct TranscribeErrorEvent {
    pub job_id: u64,
    pub audio_path: String,
    pub error: String,
}

/// 词级时间戳
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordToken {
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

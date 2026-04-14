// src-tauri/src/transcribe/types.rs — 所有数据结构定义
use serde::{Deserialize, Serialize};

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
    pub segments: Vec<TranscriptSegment>,
}

/// Whisper 转写错误事件
#[derive(Debug, Clone, Serialize)]
pub struct TranscribeErrorEvent {
    pub job_id: u64,
    pub audio_path: String,
    pub error: String,
}

/// 转写后的字幕条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: i64,
    pub en: String,
    pub start_ms: i64,
    pub end_ms: i64,
    /// 词级时间戳（可选，Whisper 启用 token_timestamps 时填充）
    #[serde(default)]
    pub words: Vec<WordToken>,
}

/// 词级时间戳
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordToken {
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

/// 原始转写片段，表示推理后端直接返回的片段结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawTranscriptSegment {
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    /// 词级时间戳；可为空，后处理层会决定是否 fallback
    #[serde(default)]
    pub tokens: Vec<WordToken>,
}

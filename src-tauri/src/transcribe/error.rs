use std::io;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum SubtitleError {
    #[error("input audio file does not exist: {0}")]
    InputNotFound(String),

    #[error("audio file path is not valid UTF-8")]
    InvalidPath,

    #[error("failed to launch ffmpeg: {0}")]
    FfmpegLaunch(#[source] io::Error),

    #[error("failed to load audio: {0}")]
    FfmpegFailed(String),

    #[error("ffmpeg returned malformed s16le PCM: odd byte length {0}")]
    InvalidPcmLength(usize),

    #[error("ASR expects 16kHz mono audio, got {sample_rate}Hz/{channels} channel(s)")]
    InvalidAudioFormat { sample_rate: u32, channels: u16 },

    #[error("failed to load VAD model: {0}")]
    VadLoad(String),

    #[error("failed to run VAD model: {0}")]
    VadInference(String),

    #[error("failed to load Whisper model: {0}")]
    WhisperLoad(String),

    #[error("failed to run Whisper model: {0}")]
    WhisperInference(String),

    #[error("failed to load alignment model: {0}")]
    AlignLoad(String),

    #[error("failed to run alignment: {0}")]
    AlignInference(String),

    #[error("writer error: {0}")]
    Writer(#[from] io::Error),
}

use std::path::Path;
use std::process::Command;

use super::error::SubtitleError;
use super::types::AudioSamples;

pub const SAMPLE_RATE: u32 = 16_000;

#[derive(Debug, Default, Clone)]
pub struct Audio;

impl Audio {
    pub fn new() -> Self {
        Self
    }

    pub fn load(&self, input: &Path) -> Result<AudioSamples, SubtitleError> {
        load_audio(input, SAMPLE_RATE)
    }
}

pub fn load_audio(input: &Path, sample_rate: u32) -> Result<AudioSamples, SubtitleError> {
    let source_path = input.to_str().ok_or(SubtitleError::InvalidPath)?.to_owned();

    let output = Command::new("ffmpeg")
        .arg("-nostdin")
        .arg("-threads")
        .arg("0")
        .arg("-i")
        .arg(input)
        .arg("-f")
        .arg("s16le")
        .arg("-ac")
        .arg("1")
        .arg("-acodec")
        .arg("pcm_s16le")
        .arg("-ar")
        .arg(sample_rate.to_string())
        .arg("-")
        .output()
        .map_err(SubtitleError::FfmpegLaunch)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        if stderr.contains("No such file") || stderr.contains("does not exist") {
            return Err(SubtitleError::InputNotFound(source_path));
        }
        return Err(SubtitleError::FfmpegFailed(stderr));
    }

    let samples = pcm_s16le_to_f32(&output.stdout)?;
    Ok(AudioSamples {
        sample_rate,
        channels: 1,
        samples,
        source_path,
    })
}

fn pcm_s16le_to_f32(bytes: &[u8]) -> Result<Vec<f32>, SubtitleError> {
    let chunks = bytes.chunks_exact(2);
    let remainder = chunks.remainder();

    if !remainder.is_empty() {
        return Err(SubtitleError::InvalidPcmLength(bytes.len()));
    }

    Ok(chunks
        .map(|chunk| {
            let value = i16::from_le_bytes([chunk[0], chunk[1]]);
            f32::from(value) / 32768.0
        })
        .collect())
}

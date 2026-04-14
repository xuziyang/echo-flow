// src-tauri/src/transcribe/audio.rs — 音频预处理与 WAV 加载
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

struct TempWav {
    path: PathBuf,
}

impl TempWav {
    fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempWav {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn convert_to_wav(audio_path: &str) -> Result<TempWav, String> {
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let output_path = std::env::temp_dir().join(format!(
        "echo-flow-whisper-{}-{}.wav",
        std::process::id(),
        unique_suffix
    ));

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            audio_path,
            "-ar",
            "16000",
            "-ac",
            "1",
            output_path.to_string_lossy().as_ref(),
        ])
        .output()
        .map_err(|e| format!("调用 ffmpeg 失败: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg 转换失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(TempWav::new(output_path))
}

pub fn load_audio_samples(audio_path: &str) -> Result<Vec<f32>, String> {
    let audio_file = Path::new(audio_path);
    let temp_wav = if audio_file.extension().and_then(|e| e.to_str()) == Some("wav") {
        None
    } else {
        Some(convert_to_wav(audio_path)?)
    };

    let wav_path = temp_wav
        .as_ref()
        .map(|wav| wav.path())
        .unwrap_or(audio_file);

    let mut reader =
        hound::WavReader::open(wav_path).map_err(|e| format!("无法读取 WAV 文件: {}", e))?;
    let spec = reader.spec();
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .filter_map(|s| s.ok())
        .map(|s| s as f32 / 32768.0)
        .collect();

    let audio: Vec<f32> = if spec.channels == 2 {
        samples
            .chunks(2)
            .map(|chunk| {
                let l = chunk.first().copied().unwrap_or(0.0);
                let r = chunk.get(1).copied().unwrap_or(0.0);
                (l + r) / 2.0
            })
            .collect()
    } else {
        samples
    };

    log::info!(
        "Whisper audio prepared: {} samples at {} Hz, {} channels",
        audio.len(),
        spec.sample_rate,
        spec.channels
    );

    Ok(audio)
}

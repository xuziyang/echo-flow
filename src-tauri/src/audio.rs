// src/audio.rs — Audio playback, file metadata, subtitle loading/saving
use log::info;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Write};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use srt::{Srt, SubTitle, Time};

/// 音频文件元数据
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioFileMetadata {
    pub id: i64,
    pub title: String,
    pub path: String,
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// 播放状态
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaybackState {
    pub path: String,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume: f32,
    pub waveform_samples: Vec<f32>,
}

// ---------------------------------------------------------------------------
// 播放器
// ---------------------------------------------------------------------------

enum PlayerState {
    Idle,
    Playing {
        start_instant: Instant,
        offset_ms: u64,
        duration_ms: u64,
    },
    Paused {
        position_ms: u64,
        duration_ms: u64,
    },
}

/// 基于 rodio 的音频播放器
pub struct AudioPlayer {
    _stream: OutputStream,
    stream_handle: OutputStreamHandle,
    sink: Option<Sink>,
    state: PlayerState,
    volume: f32,
    current_path: String,
    /// 存储解码后的 f32 样本，供波形提取使用（Phase 3）
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub sample_rate: Arc<Mutex<u32>>,
    pub channels: Arc<Mutex<u16>>,
}

impl AudioPlayer {
    pub fn new() -> Result<Self, String> {
        let (stream, stream_handle) =
            OutputStream::try_default().map_err(|e| format!("无法初始化音频输出: {}", e))?;
        Ok(Self {
            _stream: stream,
            stream_handle,
            sink: None,
            state: PlayerState::Idle,
            volume: 1.0,
            current_path: String::new(),
            samples: Arc::new(Mutex::new(Vec::new())),
            sample_rate: Arc::new(Mutex::new(44100)),
            channels: Arc::new(Mutex::new(2)),
        })
    }

    /// 仅加载音频（不播放），返回波形数据供前端显示
    pub fn load(&mut self, path: &str) -> Result<PlaybackState, String> {
        self.stop_internal();

        let file = File::open(path).map_err(|e| format!("无法打开文件: {}", e))?;
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("无法解码音频: {}", e))?;

        let sample_rate = source.sample_rate();
        let channels = source.channels() as u16;

        let all_samples: Vec<f32> = source.convert_samples().collect();
        let num_samples = all_samples.len();
        let duration_ms = if sample_rate > 0 && channels > 0 {
            (num_samples as u64 * 1000) / (sample_rate as u64 * channels as u64)
        } else {
            0
        };

        let step = if all_samples.is_empty() { 1 } else { (all_samples.len() - 1) / 200.max(1) };
        let waveform: Vec<f32> = all_samples.iter().step_by(step.max(1)).copied().take(200).collect();

        *self.samples.lock().unwrap() = all_samples;
        *self.sample_rate.lock().unwrap() = sample_rate;
        *self.channels.lock().unwrap() = channels;

        info!(
            "Loaded audio: {} samples, {} Hz, {} channels, {} ms",
            num_samples, sample_rate, channels, duration_ms
        );

        self.current_path = path.to_string();
        self.state = PlayerState::Paused {
            position_ms: 0,
            duration_ms,
        };

        Ok(PlaybackState {
            path: path.to_string(),
            is_playing: false,
            position_ms: 0,
            duration_ms,
            volume: self.volume,
            waveform_samples: waveform,
        })
    }

    /// 加载并开始播放
    pub fn start(&mut self, path: &str) -> Result<PlaybackState, String> {
        // 停止当前播放
        self.stop_internal();

        let file = File::open(path).map_err(|e| format!("无法打开文件: {}", e))?;
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("无法解码音频: {}", e))?;

        let sample_rate = source.sample_rate();
        let channels = source.channels() as u16;

        // 读取全部样本到内存（用于波形）
        let all_samples: Vec<f32> = source.convert_samples().collect();
        let num_samples = all_samples.len();
        // convert_samples() 输出 mono f32，总样本数 / 采样率 = 时长（秒）
        let duration_ms = if sample_rate > 0 && channels > 0 {
            (num_samples as u64 * 1000) / (sample_rate as u64 * channels as u64)
        } else {
            0
        };

        let step = if all_samples.is_empty() { 1 } else { (all_samples.len() - 1) / 200.max(1) };
        let waveform: Vec<f32> = all_samples.iter().step_by(step.max(1)).copied().take(200).collect();

        *self.samples.lock().unwrap() = all_samples;
        *self.sample_rate.lock().unwrap() = sample_rate;
        *self.channels.lock().unwrap() = channels;

        info!(
            "Loaded audio: {} samples, {} Hz, {} channels, {} ms",
            num_samples, sample_rate, channels, duration_ms
        );

        // 重新打开文件用于播放
        let file = File::open(path).map_err(|e| format!("无法重新打开文件: {}", e))?;
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("无法解码音频: {}", e))?;

        let sink = Sink::try_new(&self.stream_handle)
            .map_err(|e| format!("无法创建音频输出: {}", e))?;
        sink.set_volume(self.volume);
        sink.append(source);

        self.current_path = path.to_string();
        self.state = PlayerState::Playing {
            start_instant: Instant::now(),
            offset_ms: 0,
            duration_ms,
        };
        self.sink = Some(sink);

        Ok(PlaybackState {
            path: path.to_string(),
            is_playing: true,
            position_ms: 0,
            duration_ms,
            volume: self.volume,
            waveform_samples: waveform,
        })
    }

    pub fn pause(&mut self) -> PlaybackState {
        if let PlayerState::Playing {
            start_instant,
            offset_ms,
            duration_ms,
        } = &self.state
        {
            let elapsed = start_instant.elapsed().as_millis() as u64;
            let pos = offset_ms + elapsed;
            if let Some(sink) = &self.sink {
                sink.pause();
            }
            self.state = PlayerState::Paused {
                position_ms: pos,
                duration_ms: *duration_ms,
            };
        }
        self.build_state()
    }

    pub fn resume(&mut self) -> Result<PlaybackState, String> {
        if let PlayerState::Paused {
            position_ms,
            duration_ms,
        } = &self.state
        {
            if self.current_path.is_empty() {
                return Err("没有可恢复的音频文件".to_string());
            }

            // rodio Sink 不支持 seek，先停止当前 sink
            if let Some(sink) = self.sink.take() {
                sink.stop();
            }

            // 重新打开文件并 seek 到目标位置
            let file = File::open(&self.current_path)
                .map_err(|e| format!("无法打开音频文件: {}", e))?;
            let mut source = Decoder::new(BufReader::new(file))
                .map_err(|e| format!("无法解码音频: {}", e))?;
            source
                .try_seek(std::time::Duration::from_millis(*position_ms))
                .map_err(|e| format!("无法恢复播放位置: {}", e))?;

            let sink = Sink::try_new(&self.stream_handle)
                .map_err(|e| format!("无法创建音频输出: {}", e))?;
            sink.set_volume(self.volume);
            sink.append(source);
            self.sink = Some(sink);

            self.state = PlayerState::Playing {
                start_instant: Instant::now(),
                offset_ms: *position_ms,
                duration_ms: *duration_ms,
            };
        }

        Ok(self.build_state())
    }

    pub fn stop(&mut self) -> PlaybackState {
        self.stop_internal();
        self.state = PlayerState::Idle;
        self.build_state()
    }

    fn stop_internal(&mut self) {
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
    }

    pub fn seek(&mut self, position_ms: u64) -> Result<PlaybackState, String> {
        let duration_ms = match &self.state {
            PlayerState::Playing { duration_ms, .. } => *duration_ms,
            PlayerState::Paused { duration_ms, .. } => *duration_ms,
            _ => {
                return Err("没有已加载的音频，无法跳转".to_string());
            }
        };

        if self.current_path.is_empty() {
            return Err("没有已加载的音频，无法跳转".to_string());
        }

        if let Some(sink) = self.sink.take() {
            sink.stop();
        }

        let file = File::open(&self.current_path)
            .map_err(|e| format!("无法打开音频文件: {}", e))?;
        let mut source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("无法解码音频: {}", e))?;
        source
            .try_seek(std::time::Duration::from_millis(position_ms))
            .map_err(|e| format!("无法跳转到指定位置: {}", e))?;

        let sink = Sink::try_new(&self.stream_handle)
            .map_err(|e| format!("无法创建音频输出: {}", e))?;
        sink.set_volume(self.volume);
        sink.append(source);
        self.sink = Some(sink);

        self.state = PlayerState::Playing {
            start_instant: Instant::now(),
            offset_ms: position_ms,
            duration_ms,
        };
        Ok(self.build_state())
    }

    pub fn set_volume(&mut self, volume: f32) -> PlaybackState {
        self.volume = volume.clamp(0.0, 1.0);
        if let Some(sink) = &self.sink {
            sink.set_volume(self.volume);
        }
        self.build_state()
    }

    pub fn get_state(&self) -> PlaybackState {
        self.build_state()
    }

    fn build_state(&self) -> PlaybackState {
        let samples = self.samples.lock().unwrap();
        let step = if samples.is_empty() { 1 } else { (samples.len() - 1) / 200.max(1) };
        let waveform: Vec<f32> = samples.iter().step_by(step.max(1)).copied().take(200).collect();
        drop(samples);

        let (is_playing, position_ms, duration_ms) = match &self.state {
            PlayerState::Idle => (false, 0, 0),
            PlayerState::Playing {
                start_instant,
                offset_ms,
                duration_ms,
            } => {
                let elapsed = start_instant.elapsed().as_millis() as u64;
                let pos = offset_ms + elapsed;
                let finished = self.sink.as_ref().map_or(false, |s| s.empty());
                if finished {
                    return PlaybackState {
                        path: self.current_path.clone(),
                        is_playing: false,
                        position_ms: *duration_ms,
                        duration_ms: *duration_ms,
                        volume: self.volume,
                        waveform_samples: waveform,
                    };
                }
                (true, pos, *duration_ms)
            }
            PlayerState::Paused {
                position_ms,
                duration_ms,
            } => (false, *position_ms, *duration_ms),
        };
        PlaybackState {
            path: self.current_path.clone(),
            is_playing,
            position_ms,
            duration_ms,
            volume: self.volume,
            waveform_samples: waveform,
        }
    }
}

impl Default for AudioPlayer {
    fn default() -> Self {
        Self::new().expect("failed to create AudioPlayer")
    }
}

// ---------------------------------------------------------------------------
// 全局播放器实例（线程安全包装）
// ---------------------------------------------------------------------------

use std::cell::RefCell;
thread_local! {
    static PLAYER: RefCell<AudioPlayer> = RefCell::new(
        AudioPlayer::new().expect("failed to init AudioPlayer")
    );
}

// ---------------------------------------------------------------------------
// Tauri IPC 命令
// ---------------------------------------------------------------------------

/// 打开音频文件并读取元数据
#[tauri::command]
pub fn open_audio_file(path: String) -> Result<AudioFileMetadata, String> {
    let path_obj = std::path::Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    let file = File::open(&path).map_err(|e| format!("无法打开文件: {}", e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path_obj.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let format_opts = FormatOptions::default();
    let metadata_opts = MetadataOptions::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &metadata_opts)
        .map_err(|e| format!("不支持的音频格式: {}", e))?;

    let format = probed.format;
    let track = format.default_track().ok_or("未找到音频轨道")?;
    let codec_params = &track.codec_params;
    let sample_rate = codec_params.sample_rate.unwrap_or(44100);
    let channels = codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);
    let duration_ms = codec_params
        .n_frames
        .unwrap_or(0) as u64
        * 1000
        / sample_rate as u64;

    let title = path_obj
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未知文件")
        .to_string();

    let id = path.as_bytes().iter().map(|b| *b as i64).sum::<i64>().abs() % 100000;

    Ok(AudioFileMetadata {
        id,
        title,
        path,
        duration_ms,
        sample_rate,
        channels,
    })
}

/// 加载音频（不播放）
#[tauri::command]
pub fn load_audio(path: String) -> Result<PlaybackState, String> {
    PLAYER.with(|p| {
        let mut player = p.borrow_mut();
        player.load(&path)
    })
}

/// 开始播放音频
#[tauri::command]
pub fn start_playback(path: String) -> Result<PlaybackState, String> {
    PLAYER.with(|p| {
        let mut player = p.borrow_mut();
        player.start(&path)
    })
}

/// 暂停播放
#[tauri::command]
pub fn pause_playback() -> PlaybackState {
    PLAYER.with(|p| p.borrow_mut().pause())
}

/// 继续播放
#[tauri::command]
pub fn resume_playback() -> Result<PlaybackState, String> {
    PLAYER.with(|p| p.borrow_mut().resume())
}

/// 停止播放
#[tauri::command]
pub fn stop_playback() -> PlaybackState {
    PLAYER.with(|p| p.borrow_mut().stop())
}

/// 跳转播放位置
#[tauri::command]
pub fn seek_playback(position_ms: u64) -> Result<PlaybackState, String> {
    PLAYER.with(|p| p.borrow_mut().seek(position_ms))
}

/// 设置音量
#[tauri::command]
pub fn set_playback_volume(volume: f32) -> PlaybackState {
    PLAYER.with(|p| p.borrow_mut().set_volume(volume))
}

/// 获取当前播放状态
#[tauri::command]
pub fn get_playback_state() -> PlaybackState {
    PLAYER.with(|p| p.borrow().get_state())
}

/// 获取波形数据（Phase 3 预备）
#[tauri::command]
pub fn get_waveform_samples(num_samples: usize) -> Vec<f32> {
    PLAYER.with(|p| {
        let player = p.borrow();
        let samples = player.samples.lock().unwrap();
        if samples.is_empty() || num_samples == 0 {
            return Vec::new();
        }
        let step = (samples.len() - 1) / num_samples.max(1);
        samples.iter().step_by(step.max(1)).copied().take(num_samples).collect()
    })
}

// ---------------------------------------------------------------------------
// 字幕加载/保存
// ---------------------------------------------------------------------------

/// 字幕条目
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubtitleEntry {
    pub id: i64,
    pub en: String,
    pub start_ms: Option<u64>,
    pub end_ms: Option<u64>,
}

/// 加载 SRT 字幕文件
#[tauri::command]
pub fn load_subtitle_file(path: String) -> Result<Vec<SubtitleEntry>, String> {
    let content = std::fs::read(&path)
        .map_err(|e| format!("无法读取字幕文件: {}", e))?;

    let srt_data: Srt = srt::parser::parse_srt_from_slice(&content)
        .map_err(|e| format!("字幕解析失败: {}", e))?;

    let entries: Vec<SubtitleEntry> = srt_data
        .subs
        .into_iter()
        .enumerate()
        .map(|(idx, sub): (usize, SubTitle)| {
            SubtitleEntry {
                id: (idx + 1) as i64,
                en: sub.text.trim().to_string(),
                start_ms: Some(srt_time_to_ms(&sub.start_time)),
                end_ms: Some(srt_time_to_ms(&sub.end_time)),
            }
        })
        .collect();

    Ok(entries)
}

fn srt_time_to_ms(time: &Time) -> u64 {
    ((time.hours as u64 * 3600 + time.minutes as u64 * 60 + time.seconds as u64) * 1000)
        + time.milliseconds as u64
}

/// 将毫秒转换为 SRT Time
fn ms_to_srt_time(ms: u64) -> Time {
    let total_secs = ms / 1000;
    let milliseconds = (ms % 1000) as u16;
    let seconds = (total_secs % 60) as u8;
    let minutes = ((total_secs / 60) % 60) as u8;
    let hours = (total_secs / 3600) as u8;
    Time { hours, minutes, seconds, milliseconds }
}

/// 保存字幕为 SRT 文件
#[tauri::command]
pub fn save_subtitle_file(path: String, entries: Vec<SubtitleEntry>) -> Result<(), String> {
    let mut output = String::new();
    for (idx, entry) in entries.into_iter().enumerate() {
        let fallback_start_ms = idx as u64 * 5000 + 1000;
        let fallback_end_ms = idx as u64 * 5000 + 5000;
        let start_ms = entry.start_ms.unwrap_or(fallback_start_ms);
        let end_ms = entry.end_ms.unwrap_or(fallback_end_ms.max(start_ms + 500));
        let start = ms_to_srt_time(start_ms);
        let end = ms_to_srt_time(end_ms);
        let text = entry.en.clone();
        output.push_str(&format!("{}\n{} --> {}\n{}\n\n", idx + 1, start, end, text));
    }

    let mut file =
        File::create(&path).map_err(|e| format!("无法创建字幕文件: {}", e))?;
    file.write_all(output.as_bytes())
        .map_err(|e| format!("写入字幕文件失败: {}", e))?;

    Ok(())
}

/// 保存录音数据到文件
#[tauri::command]
pub fn save_recording(path: String, data: Vec<u8>) -> Result<(), String> {
    let mut file = File::create(&path)
        .map_err(|e| format!("无法创建录音文件: {}", e))?;
    file.write_all(&data)
        .map_err(|e| format!("写入录音文件失败: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ms_to_srt_time() {
        let t = ms_to_srt_time(3723123); // 1h 2m 3s 123ms
        assert_eq!(t.hours, 1);
        assert_eq!(t.minutes, 2);
        assert_eq!(t.seconds, 3);
        assert_eq!(t.milliseconds, 123);
    }
}

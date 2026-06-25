// src/audio.rs — Audio playback, file metadata, subtitle loading/saving
use log::info;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tauri::Emitter;

const WAVEFORM_PREVIEW_SAMPLES: usize = 2400;

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WaveformPreviewEvent {
    pub path: String,
    pub waveform_samples: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WaveformPreviewErrorEvent {
    pub path: String,
    pub error: String,
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
        let source =
            Decoder::new(BufReader::new(file)).map_err(|e| format!("无法解码音频: {}", e))?;

        let sample_rate = source.sample_rate();
        let channels = source.channels() as u16;

        let all_samples: Vec<f32> = source.convert_samples().collect();
        let num_samples = all_samples.len();
        let duration_ms = if sample_rate > 0 && channels > 0 {
            (num_samples as u64 * 1000) / (sample_rate as u64 * channels as u64)
        } else {
            0
        };

        let step = if all_samples.is_empty() {
            1
        } else {
            (all_samples.len() - 1) / WAVEFORM_PREVIEW_SAMPLES.max(1)
        };
        let waveform: Vec<f32> = all_samples
            .iter()
            .step_by(step.max(1))
            .copied()
            .take(WAVEFORM_PREVIEW_SAMPLES)
            .collect();

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

    /// 仅登记当前音频，不做完整解码，供导入后立即进入可播放状态。
    pub fn prepare(&mut self, path: &str, duration_ms: u64) -> PlaybackState {
        self.stop_internal();
        self.current_path = path.to_string();
        self.state = PlayerState::Paused {
            position_ms: 0,
            duration_ms,
        };
        self.samples.lock().unwrap().clear();
        *self.sample_rate.lock().unwrap() = 44100;
        *self.channels.lock().unwrap() = 2;
        self.build_state()
    }

    /// 加载并开始播放
    pub fn start(&mut self, path: &str) -> Result<PlaybackState, String> {
        // 停止当前播放
        self.stop_internal();

        let file = File::open(path).map_err(|e| format!("无法打开文件: {}", e))?;
        let source =
            Decoder::new(BufReader::new(file)).map_err(|e| format!("无法解码音频: {}", e))?;

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

        let step = if all_samples.is_empty() {
            1
        } else {
            (all_samples.len() - 1) / WAVEFORM_PREVIEW_SAMPLES.max(1)
        };
        let waveform: Vec<f32> = all_samples
            .iter()
            .step_by(step.max(1))
            .copied()
            .take(WAVEFORM_PREVIEW_SAMPLES)
            .collect();

        *self.samples.lock().unwrap() = all_samples;
        *self.sample_rate.lock().unwrap() = sample_rate;
        *self.channels.lock().unwrap() = channels;

        info!(
            "Loaded audio: {} samples, {} Hz, {} channels, {} ms",
            num_samples, sample_rate, channels, duration_ms
        );

        // 重新打开文件用于播放
        let file = File::open(path).map_err(|e| format!("无法重新打开文件: {}", e))?;
        let source =
            Decoder::new(BufReader::new(file)).map_err(|e| format!("无法解码音频: {}", e))?;

        let sink =
            Sink::try_new(&self.stream_handle).map_err(|e| format!("无法创建音频输出: {}", e))?;
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
        self.normalize_finished_state();

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
        self.normalize_finished_state();

        if let PlayerState::Paused {
            position_ms,
            duration_ms,
        } = &self.state
        {
            if self.current_path.is_empty() {
                return Err("没有可恢复的音频文件".to_string());
            }

            let resume_position_ms = if *position_ms >= *duration_ms {
                0
            } else {
                *position_ms
            };

            // rodio Sink 不支持 seek，先停止当前 sink
            if let Some(sink) = self.sink.take() {
                sink.stop();
            }

            // 重新打开文件并 seek 到目标位置
            let file =
                File::open(&self.current_path).map_err(|e| format!("无法打开音频文件: {}", e))?;
            let mut source =
                Decoder::new(BufReader::new(file)).map_err(|e| format!("无法解码音频: {}", e))?;
            source
                .try_seek(std::time::Duration::from_millis(resume_position_ms))
                .map_err(|e| format!("无法恢复播放位置: {}", e))?;

            let sink = Sink::try_new(&self.stream_handle)
                .map_err(|e| format!("无法创建音频输出: {}", e))?;
            sink.set_volume(self.volume);
            sink.append(source);
            self.sink = Some(sink);

            self.state = PlayerState::Playing {
                start_instant: Instant::now(),
                offset_ms: resume_position_ms,
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

        let file =
            File::open(&self.current_path).map_err(|e| format!("无法打开音频文件: {}", e))?;
        let mut source =
            Decoder::new(BufReader::new(file)).map_err(|e| format!("无法解码音频: {}", e))?;
        source
            .try_seek(std::time::Duration::from_millis(position_ms))
            .map_err(|e| format!("无法跳转到指定位置: {}", e))?;

        let sink =
            Sink::try_new(&self.stream_handle).map_err(|e| format!("无法创建音频输出: {}", e))?;
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
        self.normalize_finished_state();
        self.volume = volume.clamp(0.0, 1.0);
        if let Some(sink) = &self.sink {
            sink.set_volume(self.volume);
        }
        self.build_state()
    }

    pub fn get_state(&mut self) -> PlaybackState {
        self.normalize_finished_state();
        self.build_state()
    }

    fn is_sink_finished(&self) -> bool {
        matches!(self.state, PlayerState::Playing { .. })
            && self.sink.as_ref().is_some_and(|sink| sink.empty())
    }

    fn normalize_finished_state(&mut self) {
        if !self.is_sink_finished() {
            return;
        }

        if let Some(sink) = self.sink.take() {
            sink.stop();
        }

        if let PlayerState::Playing { duration_ms, .. } = self.state {
            self.state = PlayerState::Paused {
                position_ms: duration_ms,
                duration_ms,
            };
        }
    }

    fn build_state(&self) -> PlaybackState {
        let samples = self.samples.lock().unwrap();
        let step = if samples.is_empty() {
            1
        } else {
            (samples.len() - 1) / WAVEFORM_PREVIEW_SAMPLES.max(1)
        };
        let waveform: Vec<f32> = samples
            .iter()
            .step_by(step.max(1))
            .copied()
            .take(WAVEFORM_PREVIEW_SAMPLES)
            .collect();
        drop(samples);

        let (is_playing, position_ms, duration_ms) = match &self.state {
            PlayerState::Idle => (false, 0, 0),
            PlayerState::Playing {
                start_instant,
                offset_ms,
                duration_ms,
            } => {
                let elapsed = start_instant.elapsed().as_millis() as u64;
                let pos = (offset_ms + elapsed).min(*duration_ms);
                (true, pos, *duration_ms)
            }
            PlayerState::Paused {
                position_ms,
                duration_ms,
            } => (false, (*position_ms).min(*duration_ms), *duration_ms),
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
// 位置推送线程
// ---------------------------------------------------------------------------

static POSITION_EMITTING: AtomicBool = AtomicBool::new(false);

fn start_position_emitting(app: tauri::AppHandle) {
    if POSITION_EMITTING.load(Ordering::Relaxed) {
        return;
    }
    POSITION_EMITTING.store(true, Ordering::Relaxed);

    std::thread::spawn(move || {
        while POSITION_EMITTING.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(200));
            if !POSITION_EMITTING.load(Ordering::Relaxed) {
                break;
            }
            let app2 = app.clone();
            let _ = app.run_on_main_thread(move || {
                PLAYER.with(|p| {
                    let state = p.borrow_mut().get_state();
                    let _ = app2.emit("playback-state", &state);
                    if !state.is_playing {
                        POSITION_EMITTING.store(false, Ordering::Relaxed);
                    }
                });
            });
        }
    });
}

fn stop_position_emitting() {
    POSITION_EMITTING.store(false, Ordering::Relaxed);
}

fn emit_playback_state(app: &tauri::AppHandle) {
    PLAYER.with(|p| {
        let state = p.borrow_mut().get_state();
        let _ = app.emit("playback-state", &state);
    });
}

fn extract_waveform_preview(path: &str) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|e| format!("无法打开文件: {}", e))?;
    let source = Decoder::new(BufReader::new(file)).map_err(|e| format!("无法解码音频: {}", e))?;

    let all_samples: Vec<f32> = source.convert_samples().collect();
    if all_samples.is_empty() {
        return Ok(Vec::new());
    }

    let step = ((all_samples.len() - 1) / WAVEFORM_PREVIEW_SAMPLES).max(1);
    Ok(all_samples
        .iter()
        .step_by(step)
        .copied()
        .take(WAVEFORM_PREVIEW_SAMPLES)
        .collect())
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
    let channels = codec_params.channels.map(|c| c.count() as u16).unwrap_or(2);
    let duration_ms = codec_params.n_frames.unwrap_or(0) as u64 * 1000 / sample_rate as u64;

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

/// 仅登记音频基本播放状态，不做完整解码。
#[tauri::command]
pub fn prepare_audio(path: String, duration_ms: u64) -> Result<PlaybackState, String> {
    if !std::path::Path::new(&path).exists() {
        return Err(format!("文件不存在: {}", path));
    }

    PLAYER.with(|p| {
        let mut player = p.borrow_mut();
        Ok(player.prepare(&path, duration_ms))
    })
}

/// 后台加载波形预览，避免阻塞导入流程。
#[tauri::command]
pub fn load_waveform_preview(window: tauri::Window, path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).exists() {
        return Err(format!("文件不存在: {}", path));
    }

    std::thread::spawn(move || match extract_waveform_preview(&path) {
        Ok(waveform_samples) => {
            let _ = window.emit(
                "waveform-preview-ready",
                WaveformPreviewEvent {
                    path,
                    waveform_samples,
                },
            );
        }
        Err(error) => {
            let _ = window.emit(
                "waveform-preview-error",
                WaveformPreviewErrorEvent { path, error },
            );
        }
    });

    Ok(())
}

/// 开始播放音频
#[tauri::command]
pub fn start_playback(app: tauri::AppHandle, path: String) -> Result<PlaybackState, String> {
    PLAYER.with(|p| {
        let mut player = p.borrow_mut();
        player.start(&path)
    })?;
    emit_playback_state(&app);
    start_position_emitting(app);
    PLAYER.with(|p| Ok(p.borrow_mut().get_state()))
}

/// 暂停播放
#[tauri::command]
pub fn pause_playback(app: tauri::AppHandle) -> PlaybackState {
    stop_position_emitting();
    PLAYER.with(|p| p.borrow_mut().pause());
    emit_playback_state(&app);
    PLAYER.with(|p| p.borrow_mut().get_state())
}

/// 继续播放
#[tauri::command]
pub fn resume_playback(app: tauri::AppHandle) -> Result<PlaybackState, String> {
    PLAYER.with(|p| p.borrow_mut().resume())?;
    emit_playback_state(&app);
    start_position_emitting(app);
    PLAYER.with(|p| Ok(p.borrow_mut().get_state()))
}

/// 停止播放
#[tauri::command]
pub fn stop_playback(app: tauri::AppHandle) -> PlaybackState {
    stop_position_emitting();
    PLAYER.with(|p| p.borrow_mut().stop());
    emit_playback_state(&app);
    PLAYER.with(|p| p.borrow_mut().get_state())
}

/// 跳转播放位置
#[tauri::command]
pub fn seek_playback(app: tauri::AppHandle, position_ms: u64) -> Result<PlaybackState, String> {
    PLAYER.with(|p| p.borrow_mut().seek(position_ms))?;
    emit_playback_state(&app);
    PLAYER.with(|p| Ok(p.borrow_mut().get_state()))
}

/// 设置音量
#[tauri::command]
pub fn set_playback_volume(volume: f32) -> PlaybackState {
    PLAYER.with(|p| p.borrow_mut().set_volume(volume))
}

/// 获取当前播放状态
#[tauri::command]
pub fn get_playback_state() -> PlaybackState {
    PLAYER.with(|p| p.borrow_mut().get_state())
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

/// 解析 SRT 时间字符串 "HH:MM:SS,mmm"（注意逗号不是点）
fn parse_srt_time(s: &str) -> Option<u64> {
    let s = s.trim();
    // 去掉可能的空格，格式如 "00:00:01,000"
    let parts: Vec<&str> = s.split(',').collect();
    if parts.len() != 2 {
        return None;
    }
    let (h, m, sec) = {
        let t: Vec<&str> = parts[0].split(':').collect();
        if t.len() != 3 {
            return None;
        }
        let h: u64 = t[0].parse().ok()?;
        let m: u64 = t[1].parse().ok()?;
        let sec: u64 = t[2].parse().ok()?;
        (h, m, sec)
    };
    let ms: u64 = parts[1].parse().ok()?;
    Some((h * 3600 + m * 60 + sec) * 1000 + ms)
}

/// 加载 SRT 字幕文件（手动解析，不依赖 srt crate）
#[tauri::command]
pub fn load_subtitle_file(path: String) -> Result<Vec<SubtitleEntry>, String> {
    let content = std::fs::read(&path).map_err(|e| format!("无法读取字幕文件: {}", e))?;
    let text = String::from_utf8_lossy(&content);

    let mut entries: Vec<SubtitleEntry> = Vec::new();
    // SRT 块由空行分隔：索引行 + 时间行 + 文本行（可多行）
    let blocks: Vec<&str> = text.split("\n\n").collect();
    for (idx, block) in blocks.iter().enumerate() {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }
        let lines: Vec<&str> = block.split('\n').collect();
        if lines.len() < 2 {
            continue;
        }
        // 第二行是时间：`00:00:01,000 --> 00:00:04,000`
        let timing_line = lines[1];
        let timing_parts: Vec<&str> = timing_line.split("-->").collect();
        if timing_parts.len() != 2 {
            continue;
        }
        let start_ms = parse_srt_time(timing_parts[0]).unwrap_or(idx as u64 * 5000);
        let end_ms = parse_srt_time(timing_parts[1]).unwrap_or(start_ms + 3000);
        // 文本是第 3 行起所有内容
        let text = lines[2..].join("\n").trim().to_string();
        if text.is_empty() {
            continue;
        }
        entries.push(SubtitleEntry {
            id: (idx + 1) as i64,
            en: text,
            start_ms: Some(start_ms),
            end_ms: Some(end_ms),
        });
    }

    Ok(entries)
}

/// 将毫秒转换为 SRT 时间字符串 "HH:MM:SS,mmm"
fn ms_to_srt_time_str(ms: u64) -> String {
    let total_secs = ms / 1000;
    let milliseconds = ms % 1000;
    let seconds = total_secs % 60;
    let minutes = (total_secs / 60) % 60;
    let hours = total_secs / 3600;
    format!(
        "{:02}:{:02}:{:02},{:03}",
        hours, minutes, seconds, milliseconds
    )
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
        let start = ms_to_srt_time_str(start_ms);
        let end = ms_to_srt_time_str(end_ms);
        let text = entry.en.clone();
        output.push_str(&format!("{}\n{} --> {}\n{}\n\n", idx + 1, start, end, text));
    }

    let mut file = File::create(&path).map_err(|e| format!("无法创建字幕文件: {}", e))?;
    file.write_all(output.as_bytes())
        .map_err(|e| format!("写入字幕文件失败: {}", e))?;

    Ok(())
}

/// 保存录音数据到 WAV 文件
#[tauri::command]
pub fn save_recording(
    path: String,
    samples: Vec<f32>,
    sample_rate: Option<u32>,
    channels: Option<u16>,
) -> Result<(), String> {
    let sample_rate = sample_rate.unwrap_or(44100).max(1);
    let num_channels = channels.unwrap_or(1).max(1);
    let bits_per_sample = 16u16;
    let bytes_per_sample = bits_per_sample / 8;
    let block_align = num_channels * bytes_per_sample;
    let data_size = samples.len() as u32 * bytes_per_sample as u32;
    let buffer_size = 44 + data_size;

    let mut buffer = Vec::with_capacity(buffer_size as usize);

    // RIFF header
    buffer.extend_from_slice(b"RIFF");
    buffer.extend_from_slice(&(buffer_size - 8).to_le_bytes());
    buffer.extend_from_slice(b"WAVE");

    // fmt chunk
    buffer.extend_from_slice(b"fmt ");
    buffer.extend_from_slice(&16u32.to_le_bytes()); // chunk size
    buffer.extend_from_slice(&1u16.to_le_bytes()); // audio format (PCM)
    buffer.extend_from_slice(&num_channels.to_le_bytes());
    buffer.extend_from_slice(&sample_rate.to_le_bytes());
    buffer.extend_from_slice(&(sample_rate * block_align as u32).to_le_bytes()); // byte rate
    buffer.extend_from_slice(&block_align.to_le_bytes());
    buffer.extend_from_slice(&bits_per_sample.to_le_bytes());

    // data chunk
    buffer.extend_from_slice(b"data");
    buffer.extend_from_slice(&data_size.to_le_bytes());

    // Audio data
    for sample in &samples {
        let clamped = sample.max(-1.0).min(1.0);
        let int16 = if clamped < 0.0 {
            (clamped * 0x8000 as f32) as i16
        } else {
            (clamped * 0x7fff as f32) as i16
        };
        buffer.extend_from_slice(&(int16 as i16).to_le_bytes());
    }

    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建录音目录: {}", e))?;
    }

    let mut file = File::create(&path).map_err(|e| format!("无法创建录音文件: {}", e))?;
    file.write_all(&buffer)
        .map_err(|e| format!("写入录音文件失败: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ms_to_srt_time_str() {
        let t = ms_to_srt_time_str(3723123); // 1h 2m 3s 123ms
        assert_eq!(t, "01:02:03,123");
    }
}

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat, Stream};
use log::{error, info};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

static IS_RECORDING: AtomicBool = AtomicBool::new(false);
static RECORDING_DATA: once_cell::sync::Lazy<Arc<Mutex<Vec<f32>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(Vec::new())));
static RECORDING_SAMPLE_RATE: std::sync::atomic::AtomicU32 =
    std::sync::atomic::AtomicU32::new(44100);

// Store stream in a static. Box<Stream> is not Send/Sync but we only access it from the main thread
// via Tauri commands, which are always called from the main thread
thread_local! {
    static RECORDING_STREAM: std::cell::RefCell<Option<Box<Stream>>> = const { std::cell::RefCell::new(None) };
}

#[tauri::command]
pub fn is_recording() -> bool {
    IS_RECORDING.load(Ordering::SeqCst)
}

#[derive(serde::Serialize)]
pub struct RecordingInputDevice {
    #[serde(rename = "deviceId")]
    pub device_id: String,
    pub label: String,
}

#[tauri::command]
pub fn list_recording_input_devices() -> Result<Vec<RecordingInputDevice>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to list input devices: {}", e))?;

    Ok(devices
        .filter_map(|device| device.name().ok())
        .map(|name| RecordingInputDevice {
            device_id: name.clone(),
            label: name,
        })
        .collect())
}

fn drop_recording_stream() {
    RECORDING_STREAM.with(|cell| {
        cell.borrow_mut().take();
    });
}

fn resolve_input_device(host: &Host, device_id: Option<&str>) -> Result<Device, String> {
    if let Some(device_id) = device_id.map(str::trim).filter(|id| !id.is_empty()) {
        let mut devices = host
            .input_devices()
            .map_err(|e| format!("Failed to list input devices: {}", e))?;

        return devices
            .find(|device| device.name().is_ok_and(|name| name == device_id))
            .ok_or_else(|| format!("Input device not found: {}", device_id));
    }

    host.default_input_device()
        .ok_or_else(|| "No input device available".to_string())
}

#[tauri::command]
pub fn start_recording(device_id: Option<String>) -> Result<(), String> {
    if IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Already recording".to_string());
    }

    drop_recording_stream();

    let host = cpal::default_host();
    let device = resolve_input_device(&host, device_id.as_deref())?;

    info!("Using input device: {}", device.name().unwrap_or_default());

    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    info!(
        "Recording format: {} channels, {} Hz",
        config.channels(),
        config.sample_rate().0
    );

    let sample_rate = config.sample_rate().0;
    let channels = config.channels();
    let channel_count = usize::from(channels.max(1));

    RECORDING_SAMPLE_RATE.store(sample_rate, Ordering::SeqCst);
    RECORDING_DATA.lock().unwrap().clear();

    let data = RECORDING_DATA.clone();
    let is_recording = Arc::new(AtomicBool::new(true));

    let err_fn = |err| error!("Audio stream error: {}", err);

    let stream: Stream = match config.sample_format() {
        SampleFormat::F32 => {
            let data = data.clone();
            let is_recording = is_recording.clone();
            device
                .build_input_stream(
                    &config.into(),
                    move |samples: &[f32], _: &cpal::InputCallbackInfo| {
                        if is_recording.load(Ordering::SeqCst) {
                            let mut buffer = data.lock().unwrap();
                            for frame in samples.chunks(channel_count) {
                                let mono = frame.iter().copied().sum::<f32>() / frame.len() as f32;
                                buffer.push(mono);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        SampleFormat::I16 => {
            let data = data.clone();
            let is_recording = is_recording.clone();
            device
                .build_input_stream(
                    &config.into(),
                    move |samples: &[i16], _: &cpal::InputCallbackInfo| {
                        if is_recording.load(Ordering::SeqCst) {
                            let mut buffer = data.lock().unwrap();
                            for frame in samples.chunks(channel_count) {
                                let mono = frame
                                    .iter()
                                    .map(|&sample| sample as f32 / i16::MAX as f32)
                                    .sum::<f32>()
                                    / frame.len() as f32;
                                buffer.push(mono);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        SampleFormat::U16 => {
            let data = data.clone();
            let is_recording = is_recording.clone();
            device
                .build_input_stream(
                    &config.into(),
                    move |samples: &[u16], _: &cpal::InputCallbackInfo| {
                        if is_recording.load(Ordering::SeqCst) {
                            let mut buffer = data.lock().unwrap();
                            for frame in samples.chunks(channel_count) {
                                let mono = frame
                                    .iter()
                                    .map(|&sample| (sample as f32 / u16::MAX as f32) * 2.0 - 1.0)
                                    .sum::<f32>()
                                    / frame.len() as f32;
                                buffer.push(mono);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        _ => return Err("Unsupported sample format".to_string()),
    };

    stream
        .play()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    RECORDING_STREAM.with(|cell| {
        *cell.borrow_mut() = Some(Box::new(stream));
    });

    IS_RECORDING.store(true, Ordering::SeqCst);
    info!(
        "Recording started ({} Hz, {} channels)",
        sample_rate, channels
    );

    Ok(())
}

#[tauri::command]
pub fn stop_recording() -> Result<RecordingData, String> {
    if !IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }

    IS_RECORDING.store(false, Ordering::SeqCst);

    // Ensure last samples are captured
    std::thread::sleep(std::time::Duration::from_millis(100));

    drop_recording_stream();

    let data = RECORDING_DATA.lock().unwrap();
    let samples = data.clone();
    let sample_rate = RECORDING_SAMPLE_RATE.load(Ordering::SeqCst);

    info!("Recording stopped, {} samples captured", samples.len());

    Ok(RecordingData {
        samples,
        sample_rate,
        channels: 1,
    })
}

#[derive(serde::Serialize)]
pub struct RecordingData {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
}

#[tauri::command]
pub fn get_recording_waveform(num_samples: usize) -> Result<Vec<f32>, String> {
    let data = RECORDING_DATA.lock().unwrap();

    if data.is_empty() {
        return Ok(vec![]);
    }

    if num_samples == 0 {
        return Ok(vec![]);
    }

    let step = (data.len() as f32 / num_samples as f32).ceil() as usize;
    let mut waveform = Vec::with_capacity(num_samples);

    for i in 0..num_samples {
        let start = i * step;
        let end = (start + step).min(data.len());

        if start >= data.len() {
            break;
        }

        let max_val: f32 = data[start..end]
            .iter()
            .map(|s| s.abs())
            .fold(0.0f32, f32::max);

        waveform.push(max_val);
    }

    // Normalize
    let max = waveform.iter().cloned().fold(0.0f32, f32::max).max(0.001);
    for val in &mut waveform {
        *val /= max;
    }

    Ok(waveform)
}

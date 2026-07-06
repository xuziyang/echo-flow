// src-tauri/src/devices.rs — 音频设备热插拔监听
//
// cpal 0.15 没有跨平台的设备变更回调（Windows 上的 WASAPI 通知未通过 Host trait 暴露），
// 因此采用轮询：后台线程定期枚举输入/输出设备名称集合，与上次比较，变化时向前端
// 发送 `audio-devices-changed` 事件，由前端重新拉取设备列表并校验当前选择。
use cpal::traits::{DeviceTrait, HostTrait};
use log::info;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL_MS: u64 = 2000;

static WATCHING: AtomicBool = AtomicBool::new(false);

fn input_device_names() -> HashSet<String> {
    let host = cpal::default_host();
    host.input_devices()
        .map(|devices| devices.filter_map(|device| device.name().ok()).collect())
        .unwrap_or_default()
}

fn output_device_names() -> HashSet<String> {
    let host = cpal::default_host();
    host.output_devices()
        .map(|devices| devices.filter_map(|device| device.name().ok()).collect())
        .unwrap_or_default()
}

/// 启动设备热插拔监听线程。应用生命周期内常驻，输入/输出设备集合变化时发送
/// `audio-devices-changed` 事件（无 payload），前端据此刷新设备列表。
pub fn start_device_watcher(app: AppHandle) {
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        info!(
            "Audio device watcher started (poll every {}ms)",
            POLL_INTERVAL_MS
        );

        let mut last_inputs = input_device_names();
        let mut last_outputs = output_device_names();

        while WATCHING.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
            if !WATCHING.load(Ordering::SeqCst) {
                break;
            }

            let inputs = input_device_names();
            let outputs = output_device_names();

            if inputs == last_inputs && outputs == last_outputs {
                continue;
            }

            info!(
                "Audio devices changed: inputs {} -> {}, outputs {} -> {}",
                last_inputs.len(),
                inputs.len(),
                last_outputs.len(),
                outputs.len()
            );
            last_inputs = inputs;
            last_outputs = outputs;
            let _ = app.emit("audio-devices-changed", ());
        }
    });
}

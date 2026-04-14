// src-tauri/src/transcribe/srt.rs — SRT 时间格式转换与写入
use std::fs::File;
use std::io::Write;
use std::path::Path;

use crate::transcribe::types::TranscriptSegment;

/// 将毫秒转换为 SRT 时间字符串格式 "HH:MM:SS,mmm"
pub fn ms_to_srt_time_str(ms: u64) -> String {
    let total_secs = ms / 1000;
    let milliseconds = ms % 1000;
    let seconds = total_secs % 60;
    let minutes = (total_secs / 60) % 60;
    let hours = total_secs / 3600;
    format!("{:02}:{:02}:{:02},{:03}", hours, minutes, seconds, milliseconds)
}

/// 将字幕条目列表写入 SRT 文件
pub fn write_srt_file(path: &Path, segments: &[TranscriptSegment]) -> Result<(), String> {
    let mut output = String::new();
    for (idx, entry) in segments.iter().enumerate() {
        let fallback_start_ms = idx as u64 * 5000 + 1000;
        let fallback_end_ms = idx as u64 * 5000 + 5000;
        let start_ms = if entry.start_ms >= 0 {
            entry.start_ms as u64
        } else {
            fallback_start_ms
        };
        let end_ms = if entry.end_ms >= entry.start_ms && entry.end_ms >= 0 {
            entry.end_ms as u64
        } else {
            fallback_end_ms.max(start_ms + 500)
        };

        output.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            idx + 1,
            ms_to_srt_time_str(start_ms),
            ms_to_srt_time_str(end_ms),
            entry.en
        ));
    }

    let mut file = File::create(path)
        .map_err(|e| format!("无法创建字幕文件 {}: {}", path.display(), e))?;
    file.write_all(output.as_bytes())
        .map_err(|e| format!("写入字幕文件 {} 失败: {}", path.display(), e))?;
    Ok(())
}

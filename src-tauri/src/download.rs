use std::io::Write;
use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

use futures_util::{
    future::{AbortHandle, Abortable},
    StreamExt,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

static DOWNLOAD_ID: AtomicU64 = AtomicU64::new(0);
static ACTIVE_DOWNLOADS: Lazy<Mutex<HashMap<u64, ActiveDownload>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

const HF_BASE_URL: &str = "https://huggingface.co";
const HF_WHISPER_REPO: &str = "ggerganov/whisper.cpp";
const HF_ALIGNMENT_REPO: &str = "xuziyang/wav2vec2-base-en-onnx";
const HF_VAD_REPO: &str = "csukuangfj/vad";
const ALIGNMENT_VOCAB_FILENAME: &str = "wav2vec2-vocab.json";

#[derive(Debug)]
struct ActiveDownload {
    abort_handle: AbortHandle,
    temp_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ModelType {
    WhisperTiny,
    WhisperBase,
    WhisperSmall,
    WhisperMedium,
    Vad,
    Alignment,
}

impl ModelType {
    fn filename(&self) -> &'static str {
        match self {
            ModelType::WhisperTiny => "ggml-tiny.en.bin",
            ModelType::WhisperBase => "ggml-base.en.bin",
            ModelType::WhisperSmall => "ggml-small.en.bin",
            ModelType::WhisperMedium => "ggml-medium.en.bin",
            ModelType::Vad => "silero_vad.onnx",
            ModelType::Alignment => "wav2vec2-base-en.onnx",
        }
    }

    fn download_url(&self) -> String {
        match self {
            ModelType::WhisperTiny
            | ModelType::WhisperBase
            | ModelType::WhisperSmall
            | ModelType::WhisperMedium => {
                format!(
                    "{}/{}/resolve/main/{}",
                    HF_BASE_URL,
                    HF_WHISPER_REPO,
                    self.filename()
                )
            }
            ModelType::Alignment => {
                format!(
                    "{}/{}/resolve/main/{}",
                    HF_BASE_URL,
                    HF_ALIGNMENT_REPO,
                    self.filename()
                )
            }
            ModelType::Vad => {
                format!(
                    "{}/{}/resolve/main/{}",
                    HF_BASE_URL,
                    HF_VAD_REPO,
                    self.filename()
                )
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub download_id: u64,
    pub model_type: ModelType,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCompleteEvent {
    pub download_id: u64,
    pub model_type: ModelType,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadErrorEvent {
    pub download_id: u64,
    pub model_type: ModelType,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCanceledEvent {
    pub download_id: u64,
    pub model_type: ModelType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedModels {
    pub whisper_tiny: bool,
    pub whisper_base: bool,
    pub whisper_small: bool,
    pub whisper_medium: bool,
    pub vad: bool,
    pub alignment: bool,
}

fn get_model_dir(model_dir: Option<String>) -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    match model_dir {
        Some(dir) if !dir.is_empty() => {
            if dir.starts_with('~') {
                PathBuf::from(dir.replacen('~', &home, 1))
            } else {
                PathBuf::from(dir)
            }
        }
        _ => PathBuf::from(&home)
            .join(".cache")
            .join("echo-flow")
            .join("models"),
    }
}

#[tauri::command]
pub fn list_downloaded_models(model_dir: Option<String>) -> Result<DownloadedModels, String> {
    let dir = get_model_dir(model_dir);

    Ok(DownloadedModels {
        whisper_tiny: dir.join("ggml-tiny.en.bin").exists(),
        whisper_base: dir.join("ggml-base.en.bin").exists(),
        whisper_small: dir.join("ggml-small.en.bin").exists(),
        whisper_medium: dir.join("ggml-medium.en.bin").exists(),
        vad: dir.join("silero_vad.onnx").exists(),
        alignment: dir.join("wav2vec2-base-en.onnx").exists()
            && dir.join(ALIGNMENT_VOCAB_FILENAME).exists(),
    })
}

#[tauri::command]
pub fn ensure_model_dir(model_dir: Option<String>) -> Result<String, String> {
    let dir = get_model_dir(model_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn download_model(
    window: tauri::Window,
    model_type: ModelType,
    model_dir: Option<String>,
) -> Result<u64, String> {
    let download_id = DOWNLOAD_ID.fetch_add(1, Ordering::Relaxed) + 1;
    let dir = get_model_dir(model_dir);
    let filename = model_type.filename();
    let url = model_type.download_url();

    // Create directory if not exists
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    let target_path = dir.join(filename);
    let temp_path = dir.join(format!("{}.{}.part", filename, download_id));
    let vocab_temp_path = dir.join(format!("{}.{}.part", ALIGNMENT_VOCAB_FILENAME, download_id));
    let mut temp_paths = vec![temp_path.clone()];
    if model_type == ModelType::Alignment {
        temp_paths.push(vocab_temp_path.clone());
    }

    // Start download in background
    let window_for_download = window.clone();
    let window_for_cancel = window.clone();
    let model_type_clone = model_type.clone();
    let model_type_for_cancel = model_type.clone();
    let (abort_handle, abort_registration) = AbortHandle::new_pair();

    ACTIVE_DOWNLOADS
        .lock()
        .map_err(|e| format!("Failed to register download: {}", e))?
        .insert(
            download_id,
            ActiveDownload {
                abort_handle,
                temp_paths,
            },
        );

    let download_task = async move {
        let client = reqwest::Client::new();

        let response = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                let _ = window_for_download.emit(
                    "download-error",
                    DownloadErrorEvent {
                        download_id,
                        model_type: model_type_clone,
                        error: format!("Failed to start download: {}", e),
                    },
                );
                return;
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let _ = window_for_download.emit(
                "download-error",
                DownloadErrorEvent {
                    download_id,
                    model_type: model_type_clone,
                    error: format!("Download failed: HTTP {}", status),
                },
            );
            return;
        }

        let total_bytes = response.content_length();
        let mut downloaded: u64 = 0;

        let mut file = match std::fs::File::create(&temp_path) {
            Ok(f) => f,
            Err(e) => {
                let _ = window_for_download.emit(
                    "download-error",
                    DownloadErrorEvent {
                        download_id,
                        model_type: model_type_clone,
                        error: format!("Failed to create file: {}", e),
                    },
                );
                return;
            }
        };

        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    let _ = window_for_download.emit(
                        "download-error",
                        DownloadErrorEvent {
                            download_id,
                            model_type: model_type_clone.clone(),
                            error: format!("Download failed: {}", e),
                        },
                    );
                    let _ = std::fs::remove_file(&temp_path);
                    return;
                }
            };

            if let Err(e) = file.write_all(&chunk) {
                let _ = window_for_download.emit(
                    "download-error",
                    DownloadErrorEvent {
                        download_id,
                        model_type: model_type_clone,
                        error: format!("Failed to write file: {}", e),
                    },
                );
                let _ = std::fs::remove_file(&temp_path);
                return;
            }

            downloaded += chunk.len() as u64;
            let percent = match total_bytes {
                Some(total) => (downloaded as f32 / total as f32) * 100.0,
                None => 0.0,
            };

            let _ = window_for_download.emit(
                "download-progress",
                DownloadProgressEvent {
                    download_id,
                    model_type: model_type_clone.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    percent,
                },
            );
        }

        if let Err(e) = file.sync_all() {
            let _ = window_for_download.emit(
                "download-error",
                DownloadErrorEvent {
                    download_id,
                    model_type: model_type_clone,
                    error: format!("Failed to finalize download: {}", e),
                },
            );
            let _ = std::fs::remove_file(&temp_path);
            return;
        }
        drop(file);

        // For alignment model, also download the CTC vocabulary.
        if model_type_clone == ModelType::Alignment {
            let vocab_url = format!(
                "{}/{}/resolve/main/{}",
                HF_BASE_URL, HF_ALIGNMENT_REPO, ALIGNMENT_VOCAB_FILENAME
            );
            let vocab_path = dir.join(ALIGNMENT_VOCAB_FILENAME);

            match client.get(&vocab_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(bytes) = resp.bytes().await {
                        if let Err(e) = std::fs::write(&vocab_temp_path, &bytes) {
                            let _ = window_for_download.emit(
                                "download-error",
                                DownloadErrorEvent {
                                    download_id,
                                    model_type: model_type_clone,
                                    error: format!(
                                        "Failed to write {}: {}",
                                        ALIGNMENT_VOCAB_FILENAME, e
                                    ),
                                },
                            );
                            let _ = std::fs::remove_file(&temp_path);
                            let _ = std::fs::remove_file(&vocab_temp_path);
                            return;
                        }
                    } else {
                        let _ = window_for_download.emit(
                            "download-error",
                            DownloadErrorEvent {
                                download_id,
                                model_type: model_type_clone,
                                error: format!("Failed to read {}", ALIGNMENT_VOCAB_FILENAME),
                            },
                        );
                        let _ = std::fs::remove_file(&temp_path);
                        let _ = std::fs::remove_file(&vocab_temp_path);
                        return;
                    }
                }
                Ok(resp) => {
                    let _ = window_for_download.emit(
                        "download-error",
                        DownloadErrorEvent {
                            download_id,
                            model_type: model_type_clone,
                            error: format!(
                                "Failed to download {}: HTTP {}",
                                ALIGNMENT_VOCAB_FILENAME,
                                resp.status()
                            ),
                        },
                    );
                    let _ = std::fs::remove_file(&temp_path);
                    let _ = std::fs::remove_file(&vocab_temp_path);
                    return;
                }
                Err(e) => {
                    let _ = window_for_download.emit(
                        "download-error",
                        DownloadErrorEvent {
                            download_id,
                            model_type: model_type_clone,
                            error: format!(
                                "Failed to download {}: {}",
                                ALIGNMENT_VOCAB_FILENAME, e
                            ),
                        },
                    );
                    let _ = std::fs::remove_file(&temp_path);
                    let _ = std::fs::remove_file(&vocab_temp_path);
                    return;
                }
            }

            if vocab_path.exists() {
                let _ = std::fs::remove_file(&vocab_path);
            }
            if let Err(e) = std::fs::rename(&vocab_temp_path, &vocab_path) {
                let _ = window_for_download.emit(
                    "download-error",
                    DownloadErrorEvent {
                        download_id,
                        model_type: model_type_clone,
                        error: format!("Failed to install {}: {}", ALIGNMENT_VOCAB_FILENAME, e),
                    },
                );
                let _ = std::fs::remove_file(&temp_path);
                let _ = std::fs::remove_file(&vocab_temp_path);
                return;
            }
        }

        if target_path.exists() {
            let _ = std::fs::remove_file(&target_path);
        }
        if let Err(e) = std::fs::rename(&temp_path, &target_path) {
            let _ = window_for_download.emit(
                "download-error",
                DownloadErrorEvent {
                    download_id,
                    model_type: model_type_clone,
                    error: format!("Failed to install downloaded model: {}", e),
                },
            );
            let _ = std::fs::remove_file(&temp_path);
            return;
        }

        let _ = window_for_download.emit(
            "download-complete",
            DownloadCompleteEvent {
                download_id,
                model_type: model_type_clone,
                path: target_path.to_string_lossy().to_string(),
            },
        );
    };

    tokio::spawn(async move {
        if Abortable::new(download_task, abort_registration)
            .await
            .is_err()
        {
            let _ = window_for_cancel.emit(
                "download-canceled",
                DownloadCanceledEvent {
                    download_id,
                    model_type: model_type_for_cancel,
                },
            );
        }
        unregister_download(download_id);
    });

    Ok(download_id)
}

#[tauri::command]
pub fn cancel_download(download_id: u64) -> Result<(), String> {
    let active_download = ACTIVE_DOWNLOADS
        .lock()
        .map_err(|e| format!("Failed to cancel download: {}", e))?
        .remove(&download_id)
        .ok_or_else(|| format!("Download {} is not active", download_id))?;

    active_download.abort_handle.abort();
    for path in active_download.temp_paths {
        let _ = std::fs::remove_file(path);
    }

    Ok(())
}

fn unregister_download(download_id: u64) {
    if let Ok(mut active_downloads) = ACTIVE_DOWNLOADS.lock() {
        active_downloads.remove(&download_id);
    }
}

#[tauri::command]
pub fn delete_model(model_type: ModelType, model_dir: Option<String>) -> Result<(), String> {
    let dir = get_model_dir(model_dir);
    let filename = model_type.filename();
    let path = dir.join(filename);

    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    // For alignment model, also delete the CTC vocabulary.
    if model_type == ModelType::Alignment {
        let vocab_path = dir.join(ALIGNMENT_VOCAB_FILENAME);
        if vocab_path.exists() {
            std::fs::remove_file(&vocab_path)
                .map_err(|e| format!("Failed to delete {}: {}", ALIGNMENT_VOCAB_FILENAME, e))?;
        }
    }

    Ok(())
}

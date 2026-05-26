# Design: Model Download from HuggingFace

## Context

Users need to download AI models locally. The current system expects users to manually download models and place them in a configured directory, which is error-prone. This feature will add one-click model download functionality directly from HuggingFace.

## Requirements

- Let users download multiple Whisper model sizes (tiny, base, small, medium)
- VAD model is built-in and distributed with the app
- Wav2Vec2 alignment model and vocab should be downloaded together
- Download progress must be visible to users
- Models should be saved to the configured model directory

## Architecture

```
SettingsView.vue
    │
    ├── ModelDownloadSection (new component)
    │       ├── Whisper model selection with status
    │       └── Alignment model with status
    │
    └── useModelDownloadStore (new store)
            ├── downloadWhisper(size)
            ├── downloadAlignment()
            ├── checkModelStatus()
            └── 状态: downloading, installed, progress

Backend (Rust)
    │
    ├── app://models/silero_vad.onnx (built-in, in bundle)
    │
    └── 命令
            ├── list_downloaded_models
            ├── download_model
            └── delete_model

Downloads to: ~/.cache/echo-flow/models/ or user-configured directory
```

## Model Sources

| Model | HuggingFace Repo | Filename | Size |
|-------|------------------|----------|------|
| Whisper tiny.en | ggerganov/whisper.cpp | ggml-tiny.en.bin | ~75MB |
| Whisper base.en | ggerganov/whisper.cpp | ggml-base.en.bin | ~142MB |
| Whisper small.en | ggerganov/whisper.cpp | ggml-small.en.bin | ~466MB |
| Whisper medium.en | ggerganov/whisper.cpp | ggml-medium.en.bin | ~1.5GB |
| Wav2Vec2 | xuziyang/wav2vec2-base-en-onnx | wav2vec2-base-en.onnx | ~378MB |
| Vocab | xuziyang/wav2vec2-base-en-onnx | vocab.json | ~1KB |

## UI Design

### Model Download Section

```
┌─────────────────────────────────────────┐
│  Model Downloads                        │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐   │
│  │ Whisper Models                  │   │
│  │  [tiny.en] Installed ✓         [删除]│   │
│  │  [base.en] Not installed      [下载]│   │
│  │  [small.en] Not installed      [下载]│   │
│  │  [medium.en] Not installed    [下载]│   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │ AI Alignment Models            │   │
│  │  Wav2Vec2 (v1.4) ...           │   │
│  │  Status: Not installed        [下载]│   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Download Progress Dialog

```
┌─────────────────────────────────────────┐
│  Downloading: base.en ...   [████░░░]   │
│  Size: 142 MB  Progress: 67%            │
└─────────────────────────────────────────┘
```

## Backend API

```rust
// 命令定义
#[tauri::command]
pub fn list_downloaded_models(
    model_dir: Option<String>,
) -> Result<DownloadedModels, String>

#[tauri::command]
pub async fn download_model(
    window: tauri::Window,
    model_type: ModelType,
    model_dir: Option<String>,
) -> Result<(), String>

#[tauri::command]
pub fn delete_model(
    model_type: ModelType,
    model_dir: Option<String>,
) -> Result<(), String>
```

### ModelType 枚举

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelType {
    WhisperTiny,
    WhisperBase,
    WhisperSmall,
    WhisperMedium,
    Alignment,
}
```

### 进度事件

```rust
with_progress.emit("download-progress", DownloadProgressEvent {
    model_type,
    downloaded_bytes,
    total_bytes,
    percent,
});

with_progress.emit("download-complete", DownloadCompleteEvent {
    model_type,
    path,
});

with_progress.emit("download-error", DownloadErrorEvent {
    model_type,
    error: String,
});
```

## Files to Modify

| File | Purpose |
|------|---------|
| `src-tauri/src/download.rs` | Model download logic |
| `src-tauri/src/lib.rs` | Register new commands |
| `src/views/SettingsView.vue` | Add ModelDownloadSection |
| `src/stores/useSettingsStore.ts` | Add model state |
| `src/stores/useModelDownloadStore.ts` (new) | Model download store |
| `src-tauri/Cargo.toml` | Add reqwest dependency |

## Testing

1. Test downloading each Whisper model size
2. Verify downloaded models exist in correct location
3. Test download progress display
4. Test delete model functionality
5. Verify existing transcription works with downloaded models

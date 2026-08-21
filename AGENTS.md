# AGENTS.md

## Project Overview

**echo-flow** is a Tauri desktop app for audio listening and shadowing practice. It combines a Vue 3 frontend with a Rust backend for playback, recording, transcription, and model management.

## Tech Stack

| Layer | Stack |
|-------|--------|
| Desktop shell | Tauri v2 (`macos-private-api` where needed) |
| Frontend | Vue 3 (`<script setup>`), TypeScript, Vite 6 |
| State | Pinia 3 |
| Styling / icons | Tailwind CSS 4, `lucide-vue-next` |
| Backend | Rust 2021 edition |
| Audio | symphonia, rodio, cpal, hound |
| Speech / ML | whisper-rs, sentencex, ort (ONNX), ndarray |
| Async / IO | tokio, reqwest, serde / serde_json |
| Package managers | npm (frontend), Cargo (Rust) |
| Tests | Vitest (frontend unit tests) |

## Architecture

```
src/                 Vue frontend
  components/        UI by feature (layout, listening, shadowing)
  composables/       Tauri event subscriptions & reusable side effects
  stores/            Pinia domain state
  views/             Top-level overlays (e.g. settings)
src-tauri/           Rust / Tauri backend
  src/audio.rs       Decode, playback, waveform, subtitles I/O
  src/record.rs      Input devices & recording
  src/devices.rs     Device watch / hotplug
  src/transcribe/    ASR, VAD, align, cache
  src/download.rs    Model download / manage
ui/                  Legacy Alpine.js UI prototype; reference only
docs/                Design notes and implementation plans
```

**Boundary rule:** UI and interaction live in `src/`. Audio engine work (decode, play, record, transcribe, model download, filesystem-heavy paths) lives in `src-tauri/`. Frontend accesses native capabilities through Tauri commands/events or registered Tauri plugin APIs; do not introduce ad-hoc native bridges.

## Development Principles

### 1. Match existing patterns

- Prefer extending current modules, stores, and composables over introducing parallel abstractions.
- Do not add a second UI framework, CSS system, state library, or router unless explicitly requested.
- Keep naming consistent with neighbors (`useXxxStore`, `useXxxEvents`, snake_case Rust commands).

### 2. Frontend (Vue / TS)

- Use `<script setup lang="ts">` for every SFC; Composition API only.
- **Components** render UI and emit user intent; avoid burying multi-step backend orchestration in templates.
- **Pinia stores** own domain state and reusable command orchestration (player, recording, transcript, files, settings, downloads). Views may perform view-local shell interactions such as opening dialogs or folders.
- **Composables** own cross-cutting side effects—especially Tauri event listeners and sync loops (`usePlaybackSync`, `useTranscribeEvents`, etc.).
- Keep mode-specific UI split: `listening/` vs `shadowing/` vs `layout/`; settings stay in `views/`.
- Style with Tailwind utility classes and existing theme tokens (`light` / `dark` via app store). Use `lucide-vue-next` (via shared `Icon` when present) for icons.
- Colocate unit tests next to logic: `*.test.ts` beside composables/stores; run with Vitest.

### 3. Backend (Rust / Tauri)

- Add commands near the owning module (`audio`, `record`, `transcribe`, `download`) and register them in `lib.rs` `invoke_handler`.
- Long-running work (transcribe, download, waveform prep) must not block the UI thread; use async/existing background patterns and report progress with `window.emit` / `app.emit`.
- Reuse established crates for audio and ML; justify any new native dependency.
- Return actionable, user-safe errors that the frontend can display. Preserve the current `Result<T, String>` and event `error` field convention unless intentionally evolving the contract.
- Keep transcription pipeline pieces inside `transcribe/` (`asr`, `vad`, `aligner`, `cache`, …) rather than dumping logic into `lib.rs`.

### 4. Frontend ↔ backend contract

- Commands: explicit payloads, serde-friendly types, stable names (`load_audio`, `start_playback`, `transcribe_audio`, …).
- Events: use for streaming progress and device/playback state (`playback-state`, download/transcribe progress, device-lost, etc.); pair each new event with a composable or store handler.
- Prefer updating Pinia state from composable event handlers so views stay declarative.
- Dispose long-lived Tauri event listeners when their owning component or app lifecycle ends.
- Correlate asynchronous task events with `job_id`, the audio path, or an equivalent stable identifier, and ignore events from stale tasks.
- Do not re-implement decode/ASR/recording in the WebView when a command already exists (or should exist) on the Rust side.

### 5. Product domains to respect

- **Listening:** playback, subtitles, segment navigation.
- **Shadowing:** recording, waveform compare, script flow aligned to media.
- **Models / cache:** download and cache dirs are backend-owned; frontend only triggers and reflects status.
- Changing one domain should not silently couple unrelated stores without a clear shared event or command.

### 6. Quality bar

Before considering work done:

| Change type | Verify |
|-------------|--------|
| Frontend only | `npm run build` (runs `vue-tsc` + Vite) |
| Store / composable logic | `npm run test` when tests exist or were added |
| Rust backend / Tauri commands / audio | `cargo fmt --check` and `cargo check` in `src-tauri/`; run `cargo test` when relevant |
| Tauri plugins / capabilities | Verify JS and Rust dependencies, Builder registration, and `src-tauri/capabilities/` permissions; run full `npm run tauri build` for release-sensitive work |

- Add or update Vitest coverage when changing non-trivial store/composable behavior.
- Do not commit secrets, absolute personal paths, or generated `target/` / `dist/` artifacts.

### 7. Scope discipline

- Prefer small, vertical slices: command + types + store/composable + UI.
- Avoid drive-by refactors unrelated to the task.
- If a principle conflicts with an explicit user request, follow the user request and note the tradeoff briefly.

## Common Commands

```bash
npm run dev              # Vite only (port 1420)
npm run build            # typecheck + frontend production build
npm run test             # Vitest
npm run tauri dev        # full desktop app dev
npm run tauri build      # desktop bundle
cargo fmt --check        # from src-tauri/
cargo check              # from src-tauri/
cargo test               # from src-tauri/, when relevant
```

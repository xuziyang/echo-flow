# AGENTS.md

## Project Overview

**echo-flow** is a Tauri desktop application built with Vue 3 and TypeScript. It uses Vite as the build tool and targets desktop platforms via Tauri v2.

## Tech Stack

- **Frontend**: Vue 3 (Composition API, `<script setup>` SFCs), TypeScript
- **Desktop Runtime**: Tauri v2
- **Build Tool**: Vite
- **Package Manager**: npm

## Architecture

- `src/` — Vue frontend source
- `src-tauri/` — Rust/Tauri backend source
- `public/` — Static assets
- `ui/` — Additional UI resources

## Development Guidelines

- Use `<script setup>` for all Vue single-file components
- Run `npm run build` before submitting changes to ensure type-checking passes
- For Tauri-specific changes, also verify with `npm run tauri build`

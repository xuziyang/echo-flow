// src/stores/useFilesStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useTranscriptStore } from './useTranscriptStore'
import { usePlayerStore } from './usePlayerStore'
import { useAppStore } from './useAppStore'

const RECENT_FILES_STORAGE_KEY = 'echo-flow:recent-files'
const MAX_RECENT_FILES = 20

export interface FileItem {
  id: number
  title: string
  path: string
  date: string
  duration_ms: number
  openedAt: number
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatOpenedAt(openedAt: number): string {
  if (!Number.isFinite(openedAt)) return ''

  const diffMs = Date.now() - openedAt
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 24 * 60 * 60_000) return `${Math.floor(diffMs / (60 * 60_000))} 小时前`
  if (diffMs < 7 * 24 * 60 * 60_000) return `${Math.floor(diffMs / (24 * 60 * 60_000))} 天前`

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(openedAt))
}

function isPersistedFileItem(value: unknown): value is FileItem {
  if (!value || typeof value !== 'object') return false

  const item = value as Partial<FileItem>
  return (
    typeof item.id === 'number'
    && typeof item.title === 'string'
    && typeof item.path === 'string'
    && typeof item.duration_ms === 'number'
    && typeof item.openedAt === 'number'
  )
}

function loadPersistedFiles(): FileItem[] {
  if (typeof window === 'undefined') return []

  try {
    const rawFiles = window.localStorage.getItem(RECENT_FILES_STORAGE_KEY)
    if (!rawFiles) return []

    const parsed = JSON.parse(rawFiles)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(isPersistedFileItem)
      .slice(0, MAX_RECENT_FILES)
      .map(file => ({
        ...file,
        date: formatOpenedAt(file.openedAt),
      }))
  } catch (error) {
    console.warn('Failed to load recent files:', error)
    return []
  }
}

function savePersistedFiles(files: FileItem[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(files))
  } catch (error) {
    console.warn('Failed to persist recent files:', error)
  }
}

export const useFilesStore = defineStore('files', () => {
  const app = useAppStore()
  const files = ref<FileItem[]>(loadPersistedFiles())
  const currentFile = ref<FileItem | null>(null)

  function persistFiles() {
    savePersistedFiles(files.value)
  }

  function removeRecentFile(path: string) {
    files.value = files.value.filter(file => file.path !== path)
    if (currentFile.value?.path === path) {
      currentFile.value = null
    }
    persistFiles()
  }

  function upsertRecentFile(file: Omit<FileItem, 'date' | 'openedAt'>): FileItem {
    const recentFile: FileItem = {
      ...file,
      openedAt: Date.now(),
      date: '刚刚',
    }

    files.value = [
      recentFile,
      ...files.value.filter(existing => existing.path !== recentFile.path),
    ].slice(0, MAX_RECENT_FILES)
    currentFile.value = recentFile
    app.currentTitle = recentFile.title
    persistFiles()

    return recentFile
  }

  async function loadAudioFile(path: string, options?: { removeOnFailure?: boolean }): Promise<void> {
    try {
      const result = await invoke<{
        id: number; title: string; path: string; duration_ms: number
      }>('open_audio_file', { path })

      upsertRecentFile({
        id: result.id,
        title: result.title,
        path: result.path,
        duration_ms: result.duration_ms,
      })

      // 自动触发 Whisper 转写。
      const transcript = useTranscriptStore()
      void transcript.startTranscribe(result.path)

      // 先登记最小播放状态，避免导入时等待完整解码。
      const player = usePlayerStore()
      const state = await invoke<{
        path: string; is_playing: boolean; position_ms: number;
        duration_ms: number; volume: number; waveform_samples: number[];
      }>('prepare_audio', { path: result.path, durationMs: result.duration_ms })
      player.applyPlaybackState(state)

      // 波形预览改为后台加载，完成后通过事件补齐。
      void invoke('load_waveform_preview', { path: result.path }).catch((error) => {
        app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
      })
    } catch (error) {
      if (options?.removeOnFailure) {
        removeRecentFile(path)
      }
      app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
    }
  }

  async function openFile(): Promise<void> {
    const selected = await open({
      multiple: false,
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'] },
      ],
    })
    if (!selected || Array.isArray(selected)) return

    await loadAudioFile(selected)
  }

  async function openRecentFile(file: FileItem): Promise<void> {
    await loadAudioFile(file.path, { removeOnFailure: true })
  }

  return {
    files,
    currentFile,
    openFile,
    openRecentFile,
    loadAudioFile,
    removeRecentFile,
    formatDuration,
    formatOpenedAt,
  }
})

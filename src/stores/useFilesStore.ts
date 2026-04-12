// src/stores/useFilesStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useTranscriptStore } from './useTranscriptStore'
import { usePlayerStore } from './usePlayerStore'
import { useAppStore } from './useAppStore'

export interface FileItem {
  id: number
  title: string
  path: string
  date: string
  duration_ms: number
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export const useFilesStore = defineStore('files', () => {
  const app = useAppStore()
  const files = ref<FileItem[]>([])
  const currentFile = ref<FileItem | null>(null)

  async function openFile(): Promise<void> {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'] },
        ],
      })
      if (!selected) return

      const result = await invoke<{
        id: number; title: string; path: string; duration_ms: number
      }>('open_audio_file', { path: selected })

      currentFile.value = {
        id: result.id,
        title: result.title,
        path: result.path,
        date: '刚刚',
        duration_ms: result.duration_ms,
      }

      if (!files.value.find(f => f.path === result.path)) {
        files.value.unshift(currentFile.value)
      }

      // 自动触发 Whisper 转写
      const transcript = useTranscriptStore()
      void transcript.startTranscribe(result.path)

      // 先登记最小播放状态，避免导入时等待完整解码。
      const player = usePlayerStore()
      const state = await invoke<{
        path: string; is_playing: boolean; position_ms: number;
        duration_ms: number; volume: number; waveform_samples: number[];
      }>('prepare_audio', { path: selected, durationMs: result.duration_ms })
      player.applyPlaybackState(state)

      // 波形预览改为后台加载，完成后通过事件补齐。
      void invoke('load_waveform_preview', { path: selected }).catch((error) => {
        app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
      })
    } catch (error) {
      app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
    }
  }

  return { files, currentFile, openFile, formatDuration }
})

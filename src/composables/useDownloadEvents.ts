// src/composables/useDownloadEvents.ts
import { onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useModelDownloadStore } from '../stores/useModelDownloadStore'

export interface DownloadProgressEvent {
  downloadId: number
  modelType: string
  downloadedBytes: number
  totalBytes: number | null
  percent: number
}

export interface DownloadCompleteEvent {
  downloadId: number
  modelType: string
  path: string
}

export interface DownloadErrorEvent {
  downloadId: number
  modelType: string
  error: string
}

export interface DownloadCanceledEvent {
  downloadId: number
  modelType: string
}

export function useDownloadEvents() {
  const modelStore = useModelDownloadStore()
  const unlisteners: UnlistenFn[] = []

  async function setupListeners() {
    const unlistenProgress = await listen<DownloadProgressEvent>(
      'download-progress',
      (event) => {
        modelStore.downloadProgress = event.payload
        modelStore.downloadProgressPercent = event.payload.percent
      },
    )

    const unlistenComplete = await listen<DownloadCompleteEvent>(
      'download-complete',
      async () => {
        modelStore.resetDownloadState()
        await modelStore.checkModels()
      },
    )

    const unlistenError = await listen<DownloadErrorEvent>(
      'download-error',
      () => {
        modelStore.resetDownloadState()
      },
    )

    const unlistenCanceled = await listen<DownloadCanceledEvent>(
      'download-canceled',
      () => {
        modelStore.resetDownloadState()
      },
    )

    unlisteners.push(unlistenProgress, unlistenComplete, unlistenError, unlistenCanceled)
  }

  // 立即设置监听器（不等待 onMounted）
  setupListeners()

  onUnmounted(() => {
    unlisteners.forEach(fn => fn())
  })
}

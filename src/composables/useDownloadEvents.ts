// src/composables/useDownloadEvents.ts
import { onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '../stores/useAppStore'
import { useModelDownloadStore } from '../stores/useModelDownloadStore'
import { toErrorMessage } from '../utils/errors'

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
  const app = useAppStore()
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
        await modelStore.continueModelBundle()
      },
    )

    const unlistenError = await listen<DownloadErrorEvent>(
      'download-error',
      (event) => {
        modelStore.resetDownloadState()
        app.showSubtitleToast(toErrorMessage(event.payload.error), 'error')
        void modelStore.continueModelBundle()
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

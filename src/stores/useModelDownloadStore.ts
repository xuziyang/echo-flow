// src/stores/useModelDownloadStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore, type WhisperModelType } from './useSettingsStore'

export type ModelType = 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'whisper-medium' | 'vad' | 'alignment'

export interface DownloadedModels {
  whisperTiny: boolean
  whisperBase: boolean
  whisperSmall: boolean
  whisperMedium: boolean
  vad: boolean
  alignment: boolean
}

export interface DownloadProgress {
  modelType: string
  downloadedBytes: number
  totalBytes: number | null
  percent: number
}

export const useModelDownloadStore = defineStore('modelDownload', () => {
  const settings = useSettingsStore()
  const downloadedModels = ref<DownloadedModels>({
    whisperTiny: false,
    whisperBase: false,
    whisperSmall: false,
    whisperMedium: false,
    vad: false,
    alignment: false,
  })
  const downloadingType = ref<ModelType | null>(null)
  const currentDownloadId = ref<number | null>(null)
  const downloadProgress = ref<DownloadProgress | null>(null)
  const downloadProgressPercent = ref(0)

  const whisperModelTypes: WhisperModelType[] = [
    'whisper-tiny',
    'whisper-base',
    'whisper-small',
    'whisper-medium',
  ]

  async function checkModels() {
    downloadedModels.value = await invoke<DownloadedModels>('list_downloaded_models', {
      modelDir: settings.modelDirectory || null,
    })
    ensureSelectedWhisperModelIsInstalled()
  }

  async function downloadModel(type: ModelType) {
    downloadingType.value = type
    currentDownloadId.value = null
    downloadProgress.value = null
    downloadProgressPercent.value = 0

    try {
      currentDownloadId.value = await invoke<number>('download_model', {
        modelType: type,
        modelDir: settings.modelDirectory || null,
      })
    } catch (error) {
      downloadingType.value = null
      currentDownloadId.value = null
      downloadProgress.value = null
      downloadProgressPercent.value = 0
      console.error('Download failed:', error)
      throw error
    }
  }

  async function cancelDownload() {
    if (currentDownloadId.value === null) return

    const downloadId = currentDownloadId.value
    await invoke('cancel_download', { downloadId })
    downloadingType.value = null
    currentDownloadId.value = null
    downloadProgress.value = null
    downloadProgressPercent.value = 0
  }

  async function deleteModel(type: ModelType) {
    await invoke('delete_model', {
      modelType: type,
      modelDir: settings.modelDirectory || null,
    })
    await checkModels()
  }

  function ensureSelectedWhisperModelIsInstalled() {
    const installedWhisperModels = whisperModelTypes.filter(type => isModelInstalled(type))

    if (installedWhisperModels.length === 1) {
      settings.selectedWhisperModel = installedWhisperModels[0]
      return
    }

    if (isModelInstalled(settings.selectedWhisperModel)) return

    settings.selectedWhisperModel = installedWhisperModels[0] ?? 'whisper-base'
  }

  function isModelInstalled(type: ModelType): boolean {
    const installedKeyByType: Record<ModelType, keyof DownloadedModels> = {
      'whisper-tiny': 'whisperTiny',
      'whisper-base': 'whisperBase',
      'whisper-small': 'whisperSmall',
      'whisper-medium': 'whisperMedium',
      vad: 'vad',
      alignment: 'alignment',
    }

    return downloadedModels.value[installedKeyByType[type]]
  }

  return {
    downloadedModels,
    downloadProgress,
    downloadProgressPercent,
    downloadingType,
    currentDownloadId,
    isDownloading: computed(() => downloadingType.value !== null),
    checkModels,
    downloadModel,
    cancelDownload,
    deleteModel,
    isModelInstalled,
  }
})

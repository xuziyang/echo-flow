// src/stores/useModelDownloadStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from './useSettingsStore'

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
  const downloadProgress = ref<DownloadProgress | null>(null)
  const downloadProgressPercent = ref(0)

  async function checkModels() {
    downloadedModels.value = await invoke<DownloadedModels>('list_downloaded_models', {
      modelDir: settings.modelDirectory || null,
    })
  }

  async function downloadModel(type: ModelType) {
    downloadingType.value = type
    downloadProgress.value = null
    downloadProgressPercent.value = 0

    try {
      await invoke('download_model', {
        modelType: type,
        modelDir: settings.modelDirectory || null,
      })
    } catch (error) {
      console.error('Download failed:', error)
      throw error
    }
  }

  async function deleteModel(type: ModelType) {
    await invoke('delete_model', {
      modelType: type,
      modelDir: settings.modelDirectory || null,
    })
    await checkModels()
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
    isDownloading: computed(() => downloadingType.value !== null),
    checkModels,
    downloadModel,
    deleteModel,
    isModelInstalled,
  }
})

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

export const REQUIRED_SUPPORT_MODELS: ModelType[] = ['vad', 'alignment']
export const RECOMMENDED_BUNDLE_MODELS: ModelType[] = ['whisper-base', 'vad', 'alignment']

const installedKeyByType: Record<ModelType, keyof DownloadedModels> = {
  'whisper-tiny': 'whisperTiny',
  'whisper-base': 'whisperBase',
  'whisper-small': 'whisperSmall',
  'whisper-medium': 'whisperMedium',
  vad: 'vad',
  alignment: 'alignment',
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
  const bundleQueue = ref<ModelType[]>([])

  const whisperModelTypes: WhisperModelType[] = [
    'whisper-tiny',
    'whisper-base',
    'whisper-small',
    'whisper-medium',
  ]

  const requiredModelTypes = computed<ModelType[]>(() => [
    settings.selectedWhisperModel,
    ...REQUIRED_SUPPORT_MODELS,
  ])
  const missingRequiredModels = computed(() => (
    requiredModelTypes.value.filter(type => !isModelInstalled(type))
  ))
  const areRequiredModelsInstalled = computed(() => missingRequiredModels.value.length === 0)
  const isDownloading = computed(() => downloadingType.value !== null)

  async function checkModels() {
    downloadedModels.value = await invoke<DownloadedModels>('list_downloaded_models', {
      modelDir: settings.modelDirectory || null,
    })
    ensureSelectedWhisperModelIsInstalled()
  }

  async function downloadModel(type: ModelType) {
    resetDownloadState()
    downloadingType.value = type

    try {
      currentDownloadId.value = await invoke<number>('download_model', {
        modelType: type,
        modelDir: settings.modelDirectory || null,
      })
    } catch (error) {
      resetDownloadState()
      console.error('Download failed:', error)
      throw error
    }
  }

  async function cancelDownload() {
    bundleQueue.value = []
    if (currentDownloadId.value === null) {
      resetDownloadState()
      return
    }

    const downloadId = currentDownloadId.value
    await invoke('cancel_download', { downloadId })
    resetDownloadState()
  }

  async function deleteModel(type: ModelType) {
    await invoke('delete_model', {
      modelType: type,
      modelDir: settings.modelDirectory || null,
    })
    await checkModels()
  }

  async function startModelBundle(types: ModelType[]): Promise<{ started: boolean; count: number }> {
    if (isDownloading.value) return { started: false, count: 0 }

    const missing = types.filter(type => !isModelInstalled(type))
    if (!missing.length) return { started: false, count: 0 }

    const [first, ...rest] = missing
    bundleQueue.value = rest
    try {
      await downloadModel(first)
    } catch (error) {
      await continueModelBundle()
      throw error
    }
    return { started: true, count: missing.length }
  }

  async function continueModelBundle() {
    if (isDownloading.value) return

    const [next, ...rest] = bundleQueue.value
    if (!next) return

    bundleQueue.value = rest
    try {
      await downloadModel(next)
    } catch {
      await continueModelBundle()
    }
  }

  function downloadRequiredModels() {
    return startModelBundle(missingRequiredModels.value)
  }

  function downloadRecommendedBundle() {
    return startModelBundle(RECOMMENDED_BUNDLE_MODELS)
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
    return downloadedModels.value[installedKeyByType[type]]
  }

  function resetDownloadState() {
    downloadingType.value = null
    currentDownloadId.value = null
    downloadProgress.value = null
    downloadProgressPercent.value = 0
  }

  return {
    downloadedModels,
    downloadProgress,
    downloadProgressPercent,
    downloadingType,
    currentDownloadId,
    bundleQueue,
    isDownloading,
    requiredModelTypes,
    missingRequiredModels,
    areRequiredModelsInstalled,
    checkModels,
    downloadModel,
    cancelDownload,
    deleteModel,
    startModelBundle,
    continueModelBundle,
    downloadRequiredModels,
    downloadRecommendedBundle,
    isModelInstalled,
    resetDownloadState,
  }
})

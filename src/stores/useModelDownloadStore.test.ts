import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useModelDownloadStore } from './useModelDownloadStore'
import { useSettingsStore } from './useSettingsStore'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

function emptyModels() {
  return {
    whisperTiny: false,
    whisperBase: false,
    whisperSmall: false,
    whisperMedium: false,
    vad: false,
    alignment: false,
  }
}

describe('useModelDownloadStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
  })

  it('lists missing required models for the selected whisper plus support models', () => {
    const settings = useSettingsStore()
    const models = useModelDownloadStore()
    settings.selectedWhisperModel = 'whisper-base'
    models.downloadedModels = emptyModels()

    expect(models.missingRequiredModels).toEqual(['whisper-base', 'vad', 'alignment'])
    expect(models.areRequiredModelsInstalled).toBe(false)
  })

  it('treats required models as installed when selected whisper, vad, and alignment exist', () => {
    const settings = useSettingsStore()
    const models = useModelDownloadStore()
    settings.selectedWhisperModel = 'whisper-tiny'
    models.downloadedModels = {
      ...emptyModels(),
      whisperTiny: true,
      vad: true,
      alignment: true,
    }

    expect(models.missingRequiredModels).toEqual([])
    expect(models.areRequiredModelsInstalled).toBe(true)
  })

  it('queues remaining recommended models and starts the first download', async () => {
    const models = useModelDownloadStore()
    models.downloadedModels = emptyModels()
    invokeMock.mockResolvedValue(7)

    const result = await models.downloadRecommendedBundle()

    expect(result).toEqual({ started: true, count: 3 })
    expect(invokeMock).toHaveBeenCalledWith('download_model', {
      modelType: 'whisper-base',
      modelDir: null,
    })
    expect(models.downloadingType).toBe('whisper-base')
    expect(models.bundleQueue).toEqual(['vad', 'alignment'])
  })

  it('continues the bundle queue after the current download finishes', async () => {
    const models = useModelDownloadStore()
    models.downloadedModels = emptyModels()
    invokeMock.mockResolvedValue(8)
    await models.downloadRecommendedBundle()
    models.resetDownloadState()

    await models.continueModelBundle()

    expect(invokeMock).toHaveBeenLastCalledWith('download_model', {
      modelType: 'vad',
      modelDir: null,
    })
    expect(models.downloadingType).toBe('vad')
    expect(models.bundleQueue).toEqual(['alignment'])
  })

  it('does not start a bundle when every requested model is already installed', async () => {
    const models = useModelDownloadStore()
    models.downloadedModels = {
      ...emptyModels(),
      whisperBase: true,
      vad: true,
      alignment: true,
    }

    const result = await models.downloadRecommendedBundle()

    expect(result).toEqual({ started: false, count: 0 })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('clears the bundle queue when a download is canceled', async () => {
    const models = useModelDownloadStore()
    models.downloadedModels = emptyModels()
    invokeMock.mockResolvedValue(9)
    await models.downloadRecommendedBundle()

    await models.cancelDownload()

    expect(invokeMock).toHaveBeenCalledWith('cancel_download', { downloadId: 9 })
    expect(models.bundleQueue).toEqual([])
    expect(models.downloadingType).toBeNull()
    expect(models.currentDownloadId).toBeNull()
  })
})

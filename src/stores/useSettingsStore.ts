// src/stores/useSettingsStore.ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export type WhisperModelType = 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'whisper-medium'

export interface AudioDeviceOption {
  deviceId: string
  label: string
}

interface PersistedSettings {
  selectedInputId?: string
  selectedOutputId?: string
  modelDirectory?: string
  selectedWhisperModel?: WhisperModelType
}

const STORAGE_KEY = 'echo-flow:settings'

function loadPersistedSettings(): PersistedSettings {
  if (typeof window === 'undefined') return {}

  try {
    const rawSettings = window.localStorage.getItem(STORAGE_KEY)
    if (!rawSettings) return {}

    const settings = JSON.parse(rawSettings)
    if (!settings || typeof settings !== 'object') return {}

    return {
      selectedInputId: typeof settings.selectedInputId === 'string' ? settings.selectedInputId : undefined,
      selectedOutputId: typeof settings.selectedOutputId === 'string' ? settings.selectedOutputId : undefined,
      modelDirectory: typeof settings.modelDirectory === 'string' ? settings.modelDirectory : undefined,
      selectedWhisperModel: isWhisperModelType(settings.selectedWhisperModel)
        ? settings.selectedWhisperModel
        : undefined,
    }
  } catch (error) {
    console.warn('Failed to load persisted settings:', error)
    return {}
  }
}

function isWhisperModelType(value: unknown): value is WhisperModelType {
  return (
    value === 'whisper-tiny'
    || value === 'whisper-base'
    || value === 'whisper-small'
    || value === 'whisper-medium'
  )
}

function savePersistedSettings(settings: PersistedSettings) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.warn('Failed to persist settings:', error)
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const persistedSettings = loadPersistedSettings()
  const audioInputDevices = ref<AudioDeviceOption[]>([])
  const audioOutputDevices = ref<AudioDeviceOption[]>([])
  const selectedInputId = ref(persistedSettings.selectedInputId ?? '')
  const selectedOutputId = ref(persistedSettings.selectedOutputId ?? '')
  const modelDirectory = ref(persistedSettings.modelDirectory ?? '')
  const selectedWhisperModel = ref<WhisperModelType>(persistedSettings.selectedWhisperModel ?? 'whisper-base')

  // 拉取最新输入设备列表；若已选设备已消失则清空选择（回退到系统默认）。
  async function refreshAudioInputDevices() {
    try {
      const devices = await invoke<AudioDeviceOption[]>('list_recording_input_devices')
      audioInputDevices.value = devices
      if (selectedInputId.value && !devices.some((device) => device.deviceId === selectedInputId.value)) {
        selectedInputId.value = ''
      }
    } catch (error) {
      console.warn('Failed to load audio input devices:', error)
    }
  }

  // 拉取最新输出设备列表；若已选设备已消失则清空选择（回退到系统默认）。
  async function refreshAudioOutputDevices() {
    try {
      const devices = await invoke<AudioDeviceOption[]>('list_playback_output_devices')
      audioOutputDevices.value = devices
      if (selectedOutputId.value && !devices.some((device) => device.deviceId === selectedOutputId.value)) {
        selectedOutputId.value = ''
      }
    } catch (error) {
      console.warn('Failed to load audio output devices:', error)
    }
  }

  watch(
    [selectedInputId, selectedOutputId, modelDirectory, selectedWhisperModel],
    () => {
      savePersistedSettings({
        selectedInputId: selectedInputId.value,
        selectedOutputId: selectedOutputId.value,
        modelDirectory: modelDirectory.value,
        selectedWhisperModel: selectedWhisperModel.value,
      })
    },
  )

  return {
    audioInputDevices,
    audioOutputDevices,
    selectedInputId,
    selectedOutputId,
    modelDirectory,
    selectedWhisperModel,
    refreshAudioInputDevices,
    refreshAudioOutputDevices,
  }
})

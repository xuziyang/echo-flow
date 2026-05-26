// src/stores/useSettingsStore.ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

interface PersistedSettings {
  selectedInputId?: string
  selectedOutputId?: string
  modelDirectory?: string
}

const STORAGE_KEY = 'echo-flow:settings'

function loadPersistedSettings(): PersistedSettings {
  if (typeof window === 'undefined') return {}

  try {
    const rawSettings = window.localStorage.getItem(STORAGE_KEY)
    if (!rawSettings) return {}

    const settings = JSON.parse(rawSettings)
    return settings && typeof settings === 'object' ? settings : {}
  } catch (error) {
    console.warn('Failed to load persisted settings:', error)
    return {}
  }
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
  const audioInputDevices = ref<MediaDeviceInfo[]>([])
  const audioOutputDevices = ref<MediaDeviceInfo[]>([])
  const selectedInputId = ref(persistedSettings.selectedInputId ?? '')
  const selectedOutputId = ref(persistedSettings.selectedOutputId ?? '')
  const modelDirectory = ref(persistedSettings.modelDirectory ?? '')

  watch(
    [selectedInputId, selectedOutputId, modelDirectory],
    () => {
      savePersistedSettings({
        selectedInputId: selectedInputId.value,
        selectedOutputId: selectedOutputId.value,
        modelDirectory: modelDirectory.value,
      })
    },
  )

  return { audioInputDevices, audioOutputDevices, selectedInputId, selectedOutputId, modelDirectory }
})

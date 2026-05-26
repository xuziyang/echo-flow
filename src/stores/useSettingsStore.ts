// src/stores/useSettingsStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const audioInputDevices = ref<MediaDeviceInfo[]>([])
  const audioOutputDevices = ref<MediaDeviceInfo[]>([])
  const selectedInputId = ref('')
  const selectedOutputId = ref('')
  const modelDirectory = ref('')

  return { audioInputDevices, audioOutputDevices, selectedInputId, selectedOutputId, modelDirectory }
})

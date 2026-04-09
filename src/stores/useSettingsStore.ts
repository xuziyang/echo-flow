// src/stores/useSettingsStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const audioInputDevices = ref<MediaDeviceInfo[]>([])
  const audioOutputDevices = ref<MediaDeviceInfo[]>([])
  const selectedInputId = ref('')
  const selectedOutputId = ref('')

  function setInputDevice(id: string) { selectedInputId.value = id }
  function setOutputDevice(id: string) { selectedOutputId.value = id }

  return { audioInputDevices, audioOutputDevices, selectedInputId, selectedOutputId, setInputDevice, setOutputDevice }
})

// src/stores/useSettingsStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Language { code: string; label: string }

export const useSettingsStore = defineStore('settings', () => {
  const languages = ref<Language[]>([
    { code: 'zh-CN', label: '简体中文 (Chinese)' },
    { code: 'en-US', label: 'English (US)' },
    { code: 'ja-JP', label: '日本語 (Japanese)' },
    { code: 'es-ES', label: 'Español (Spanish)' },
  ])
  const selectedLanguage = ref('zh-CN')
  const audioInputDevices = ref<MediaDeviceInfo[]>([])
  const audioOutputDevices = ref<MediaDeviceInfo[]>([])
  const selectedInputId = ref('')
  const selectedOutputId = ref('')

  function setLanguage(code: string) { selectedLanguage.value = code }
  function setInputDevice(id: string) { selectedInputId.value = id }
  function setOutputDevice(id: string) { selectedOutputId.value = id }

  return { languages, selectedLanguage, audioInputDevices, audioOutputDevices,
           selectedInputId, selectedOutputId, setLanguage, setInputDevice, setOutputDevice }
})

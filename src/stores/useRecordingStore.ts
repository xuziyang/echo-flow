// src/stores/useRecordingStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useRecordingStore = defineStore('recording', () => {
  const isRecording = ref(false)
  const userAudioUrl = ref<string | null>(null)

  function toggleRecording() { isRecording.value = !isRecording.value }
  function playComparison() { /* 静态原型：无实际逻辑 */ }

  return { isRecording, userAudioUrl, toggleRecording, playComparison }
})

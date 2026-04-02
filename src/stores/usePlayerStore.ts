// src/stores/usePlayerStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  const isPlaying = ref(false)
  const isLooping = ref(false)
  const currentIndex = ref(0)
  const volume = ref(80)
  const lastVolume = ref(80)
  const showEn = ref(true)
  const showZh = ref(false)

  function togglePlay() { isPlaying.value = !isPlaying.value }
  function toggleLoop() { isLooping.value = !isLooping.value }
  function toggleMute() {
    if (volume.value > 0) { lastVolume.value = volume.value; volume.value = 0 }
    else { volume.value = lastVolume.value || 80 }
  }
  function setVolume(v: number) { volume.value = v }
  function setCurrentIndex(i: number) { currentIndex.value = i }
  function prevSentence() { if (currentIndex.value > 0) currentIndex.value-- }
  function nextSentence(maxIndex: number) { if (currentIndex.value < maxIndex) currentIndex.value++ }
  function toggleEn() { showEn.value = !showEn.value }
  function toggleZh() { showZh.value = !showZh.value }

  return { isPlaying, isLooping, currentIndex, volume, lastVolume, showEn, showZh,
           togglePlay, toggleLoop, toggleMute, setVolume, setCurrentIndex,
           prevSentence, nextSentence, toggleEn, toggleZh }
})

// src/stores/usePlayerStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export interface PlaybackState {
  path: string
  is_playing: boolean
  position_ms: number
  duration_ms: number
  volume: number
  waveform_samples: number[]
}

export const usePlayerStore = defineStore('player', () => {
  const isPlaying = ref(false)
  const isLooping = ref(false)
  const currentIndex = ref(0)
  const volume = ref(80)
  const lastVolume = ref(80)
  const showEn = ref(true)
  const showZh = ref(false)
  const currentPath = ref('')
  const positionMs = ref(0)
  const durationMs = ref(0)
  const waveformSamples = ref<number[]>([])

  // 轮询播放位置（每 200ms）
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(async () => {
      try {
        const state = await invoke<PlaybackState>('get_playback_state')
        isPlaying.value = state.is_playing
        positionMs.value = state.position_ms
        durationMs.value = state.duration_ms
        if (!state.is_playing && pollTimer) {
          stopPolling()
        }
      } catch {
        // ignore
      }
    }, 200)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function startPlayback(path: string) {
    const state = await invoke<PlaybackState>('start_playback', { path })
    console.log('[player] waveform_samples length:', state.waveform_samples?.length, 'first 3:', state.waveform_samples?.slice(0, 3))
    currentPath.value = state.path
    isPlaying.value = state.is_playing
    positionMs.value = state.position_ms
    durationMs.value = state.duration_ms
    waveformSamples.value = state.waveform_samples
    console.log('[player] waveformSamples set to:', waveformSamples.value.length)
    startPolling()
  }

  async function togglePlay() {
    if (!currentPath.value) return
    if (isPlaying.value) {
      await invoke('pause_playback')
      stopPolling()
      isPlaying.value = false
    } else {
      await invoke('resume_playback')
      isPlaying.value = true
      startPolling()
    }
  }

  async function stopPlayback() {
    stopPolling()
    await invoke<PlaybackState>('stop_playback')
    isPlaying.value = false
    positionMs.value = 0
  }

  async function seekTo(ms: number) {
    const state = await invoke<PlaybackState>('seek_playback', { positionMs: ms })
    positionMs.value = state.position_ms
  }

  function toggleLoop() { isLooping.value = !isLooping.value }

  function toggleMute() {
    if (volume.value > 0) { lastVolume.value = volume.value; volume.value = 0 }
    else { volume.value = lastVolume.value || 80 }
    invoke('set_playback_volume', { volume: volume.value / 100 })
  }

  async function setVolume(v: number) {
    volume.value = v
    await invoke('set_playback_volume', { volume: v / 100 })
  }

  function setCurrentIndex(i: number) { currentIndex.value = i }
  function prevSentence() { if (currentIndex.value > 0) currentIndex.value-- }
  function nextSentence(maxIndex: number) { if (currentIndex.value < maxIndex) currentIndex.value++ }
  function toggleEn() { showEn.value = !showEn.value }
  function toggleZh() { showZh.value = !showZh.value }

  return {
    isPlaying, isLooping, currentIndex, volume, lastVolume, showEn, showZh,
    currentPath, positionMs, durationMs, waveformSamples,
    startPlayback, togglePlay, stopPlayback, seekTo,
    toggleLoop, toggleMute, setVolume, setCurrentIndex, prevSentence, nextSentence,
    toggleEn, toggleZh,
  }
})

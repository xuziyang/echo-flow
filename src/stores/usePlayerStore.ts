import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'

export interface PlaybackState {
  path: string
  is_playing: boolean
  position_ms: number
  duration_ms: number
  volume: number
  waveform_samples: number[]
}

export const usePlayerStore = defineStore('player', () => {
  const app = useAppStore()
  const isPlaying = ref(false)
  const isLooping = ref(false)
  const currentIndex = ref(0)
  const volume = ref(80)
  const lastVolume = ref(80)
  const showEn = ref(true)
  const currentPath = ref('')
  const positionMs = ref(0)
  const durationMs = ref(0)
  const waveformSamples = ref<number[]>([])

  function notifyPlaybackError(error: unknown) {
    const message = typeof error === 'string' ? error : String(error)
    app.showSubtitleToast(message, 'error')
  }

  function applyPlaybackState(state: PlaybackState, options?: { includeWaveform?: boolean }) {
    currentPath.value = state.path
    positionMs.value = state.position_ms
    durationMs.value = state.duration_ms
    isPlaying.value = state.is_playing

    if (options?.includeWaveform !== false) {
      waveformSamples.value = state.waveform_samples
    }
  }

  function setEstimatedPosition(ms: number) {
    const clamped = durationMs.value > 0 ? Math.min(Math.max(0, ms), durationMs.value) : Math.max(0, ms)
    positionMs.value = clamped
  }

  async function startPlayback(path: string) {
    try {
      const state = await invoke<PlaybackState>('start_playback', { path })
      applyPlaybackState(state)
    } catch (error) {
      notifyPlaybackError(error)
    }
  }

  async function togglePlay() {
    if (!currentPath.value) return
    try {
      if (isPlaying.value) {
        const state = await invoke<PlaybackState>('pause_playback')
        applyPlaybackState(state, { includeWaveform: false })
      } else {
        const state = await invoke<PlaybackState>('resume_playback')
        applyPlaybackState(state, { includeWaveform: false })
      }
    } catch (error) {
      notifyPlaybackError(error)
    }
  }

  async function stopPlayback() {
    try {
      const state = await invoke<PlaybackState>('stop_playback')
      applyPlaybackState(state, { includeWaveform: false })
    } catch (error) {
      notifyPlaybackError(error)
    }
  }

  async function seekTo(ms: number) {
    try {
      const state = await invoke<PlaybackState>('seek_playback', { position_ms: ms })
      applyPlaybackState(state, { includeWaveform: false })
    } catch (error) {
      notifyPlaybackError(error)
    }
  }

  function toggleLoop() { isLooping.value = !isLooping.value }

  function toggleMute() {
    if (volume.value > 0) { lastVolume.value = volume.value; volume.value = 0 }
    else { volume.value = lastVolume.value || 80 }
    invoke('set_playback_volume', { volume: volume.value / 100 }).catch(notifyPlaybackError)
  }

  async function setVolume(v: number) {
    const previousVolume = volume.value
    volume.value = v
    try {
      await invoke('set_playback_volume', { volume: v / 100 })
    } catch (error) {
      volume.value = previousVolume
      notifyPlaybackError(error)
    }
  }

  function setCurrentIndex(i: number) { currentIndex.value = i }
  function prevSentence() { if (currentIndex.value > 0) currentIndex.value-- }
  function nextSentence(maxIndex: number) { if (currentIndex.value < maxIndex) currentIndex.value++ }
  function toggleEn() { showEn.value = !showEn.value }

  return {
    isPlaying, isLooping, currentIndex, volume, lastVolume, showEn,
    currentPath, positionMs, durationMs, waveformSamples,
    applyPlaybackState, setEstimatedPosition,
    startPlayback, togglePlay, stopPlayback, seekTo,
    toggleLoop, toggleMute, setVolume, setCurrentIndex, prevSentence, nextSentence,
    toggleEn,
  }
})

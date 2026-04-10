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

const WAVEFORM_ZOOM_KEY = 'echo-flow.waveform-zoom'
const MIN_WAVEFORM_ZOOM = 1
const MAX_WAVEFORM_ZOOM = 40
const WAVEFORM_ZOOM_STEP = 0.25

function clampWaveformZoom(value: number): number {
  return Math.min(MAX_WAVEFORM_ZOOM, Math.max(MIN_WAVEFORM_ZOOM, value))
}

function loadWaveformZoom(): number {
  if (typeof window === 'undefined') return MIN_WAVEFORM_ZOOM
  const stored = window.localStorage.getItem(WAVEFORM_ZOOM_KEY)
  if (!stored) return MIN_WAVEFORM_ZOOM
  const parsed = Number.parseFloat(stored)
  if (!Number.isFinite(parsed)) return MIN_WAVEFORM_ZOOM
  return clampWaveformZoom(parsed)
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
  const waveformZoom = ref(loadWaveformZoom())

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

  function persistWaveformZoom() {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(WAVEFORM_ZOOM_KEY, waveformZoom.value.toString())
  }

  function setWaveformZoom(value: number) {
    waveformZoom.value = clampWaveformZoom(Math.round(value * 100) / 100)
    persistWaveformZoom()
  }

  function zoomInWaveform() {
    setWaveformZoom(waveformZoom.value + WAVEFORM_ZOOM_STEP)
  }

  function zoomOutWaveform() {
    setWaveformZoom(waveformZoom.value - WAVEFORM_ZOOM_STEP)
  }

  function resetWaveformZoom() {
    setWaveformZoom(MIN_WAVEFORM_ZOOM)
  }

  function setCurrentIndex(i: number) { currentIndex.value = i }
  function prevSentence() { if (currentIndex.value > 0) currentIndex.value-- }
  function nextSentence(maxIndex: number) { if (currentIndex.value < maxIndex) currentIndex.value++ }
  function toggleEn() { showEn.value = !showEn.value }

  return {
    isPlaying, isLooping, currentIndex, volume, lastVolume, showEn,
    currentPath, positionMs, durationMs, waveformSamples, waveformZoom,
    applyPlaybackState, setEstimatedPosition,
    startPlayback, togglePlay, stopPlayback, seekTo,
    toggleLoop, toggleMute, setVolume, setCurrentIndex, prevSentence, nextSentence,
    toggleEn, setWaveformZoom, zoomInWaveform, zoomOutWaveform, resetWaveformZoom,
  }
})

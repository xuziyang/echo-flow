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

const WAVEFORM_ZOOM_KEY = 'echo-flow.waveform-zoom'
const MIN_WAVEFORM_ZOOM = 1
const MAX_WAVEFORM_ZOOM = 40
const WAVEFORM_ZOOM_STEP = 0.25
const PLAYBACK_POLL_INTERVAL_MS = 200

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
  const waveformZoom = ref(loadWaveformZoom())

  // 后端状态校准时间点（用于前端连续外推）
  let lastSyncPositionMs = 0
  let lastSyncPerfMs = 0

  // 低频轮询做状态校准
  let pollTimer: ReturnType<typeof setInterval> | null = null
  // 高频 requestAnimationFrame 做平滑外推
  let rafId: number | null = null

  function nowMs() {
    if (typeof window !== 'undefined' && typeof window.performance !== 'undefined') {
      return window.performance.now()
    }
    return Date.now()
  }

  function calibratePosition(state: PlaybackState) {
    lastSyncPositionMs = state.position_ms
    lastSyncPerfMs = nowMs()
    positionMs.value = state.position_ms
    durationMs.value = state.duration_ms
    isPlaying.value = state.is_playing
  }

  function startPositionExtrapolation() {
    if (rafId !== null) return
    if (typeof window === 'undefined') return

    const tick = () => {
      if (!isPlaying.value) {
        stopPositionExtrapolation()
        return
      }
      const elapsed = Math.max(0, nowMs() - lastSyncPerfMs)
      const estimated = Math.round(lastSyncPositionMs + elapsed)
      const clamped = durationMs.value > 0 ? Math.min(estimated, durationMs.value) : estimated
      positionMs.value = clamped
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
  }

  function stopPositionExtrapolation() {
    if (typeof window === 'undefined') return
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(async () => {
      try {
        const state = await invoke<PlaybackState>('get_playback_state')
        calibratePosition(state)
        if (state.is_playing) {
          startPositionExtrapolation()
        } else {
          stopPositionExtrapolation()
        }
        if (!state.is_playing && pollTimer) {
          stopPolling()
        }
      } catch {
        // ignore
      }
    }, PLAYBACK_POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    stopPositionExtrapolation()
  }

  async function startPlayback(path: string) {
    const state = await invoke<PlaybackState>('start_playback', { path })
    console.log('[player] waveform_samples length:', state.waveform_samples?.length, 'first 3:', state.waveform_samples?.slice(0, 3))
    currentPath.value = state.path
    calibratePosition(state)
    waveformSamples.value = state.waveform_samples
    console.log('[player] waveformSamples set to:', waveformSamples.value.length)
    startPolling()
    if (state.is_playing) {
      startPositionExtrapolation()
    }
  }

  async function togglePlay() {
    if (!currentPath.value) return
    if (isPlaying.value) {
      const state = await invoke<PlaybackState>('pause_playback')
      calibratePosition(state)
      stopPositionExtrapolation()
      stopPolling()
    } else {
      const state = await invoke<PlaybackState>('resume_playback')
      calibratePosition(state)
      startPolling()
      if (state.is_playing) {
        startPositionExtrapolation()
      }
    }
  }

  async function stopPlayback() {
    stopPolling()
    const state = await invoke<PlaybackState>('stop_playback')
    calibratePosition(state)
  }

  async function seekTo(ms: number) {
    const state = await invoke<PlaybackState>('seek_playback', { position_ms: ms })
    calibratePosition(state)
    if (state.is_playing) {
      startPositionExtrapolation()
    } else {
      stopPositionExtrapolation()
    }
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
  function toggleZh() { showZh.value = !showZh.value }

  return {
    isPlaying, isLooping, currentIndex, volume, lastVolume, showEn, showZh,
    currentPath, positionMs, durationMs, waveformSamples, waveformZoom,
    startPlayback, togglePlay, stopPlayback, seekTo,
    toggleLoop, toggleMute, setVolume, setCurrentIndex, prevSentence, nextSentence,
    toggleEn, toggleZh, setWaveformZoom, zoomInWaveform, zoomOutWaveform, resetWaveformZoom,
  }
})

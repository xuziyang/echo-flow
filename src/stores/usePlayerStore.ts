import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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
  const listeningIndex = ref(0)
  const shadowingIndex = ref(0)
  const currentIndex = computed({
    get() {
      return app.mode === 'shadowing' ? shadowingIndex.value : listeningIndex.value
    },
    set(val: number) {
      if (app.mode === 'shadowing') {
        shadowingIndex.value = val
      } else {
        listeningIndex.value = val
      }
    },
  })
  const volume = ref(80)
  const lastVolume = ref(80)
  const showEn = ref(true)
  const currentPath = ref('')
  const positionMs = ref(0)
  const durationMs = ref(0)
  const seeking = ref(false)
  const waveformSamples = ref<number[]>([])
  const activeSegmentEndMs = ref<number | null>(null)

  let segmentMonitorId: ReturnType<typeof setInterval> | null = null
  let segmentPlaybackToken = 0
  let resolveSegmentPlayback: ((completed: boolean) => void) | null = null

  function notifyPlaybackError(error: unknown) {
    const message = typeof error === 'string' ? error : String(error)
    app.showSubtitleToast(message, 'error')
  }

  function finishSegmentPlayback(completed: boolean) {
    activeSegmentEndMs.value = null
    if (segmentMonitorId !== null) {
      clearInterval(segmentMonitorId)
      segmentMonitorId = null
    }

    if (resolveSegmentPlayback) {
      resolveSegmentPlayback(completed)
      resolveSegmentPlayback = null
    }
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

  function applyWaveformPreview(path: string, samples: number[]) {
    if (path !== currentPath.value) return
    waveformSamples.value = samples
  }

  function setEstimatedPosition(ms: number) {
    if (seeking.value) return
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
    finishSegmentPlayback(false)
    try {
      const state = await invoke<PlaybackState>('stop_playback')
      applyPlaybackState(state, { includeWaveform: false })
    } catch (error) {
      notifyPlaybackError(error)
    }
  }

  async function seekTo(ms: number) {
    seeking.value = true
    try {
      const state = await invoke<PlaybackState>('seek_playback', { positionMs: ms })
      applyPlaybackState(state, { includeWaveform: false })
    } catch (error) {
      notifyPlaybackError(error)
    } finally {
      seeking.value = false
    }
  }

  function canPlaySentenceSegment(startMs?: number, endMs?: number) {
    return Boolean(
      currentPath.value
      && Number.isFinite(startMs)
      && Number.isFinite(endMs)
      && (startMs as number) >= 0
      && (endMs as number) > (startMs as number),
    )
  }

  async function clearSentenceSegment(options?: { pausePlayback?: boolean }) {
    segmentPlaybackToken += 1
    finishSegmentPlayback(false)

    if (!options?.pausePlayback || !isPlaying.value) {
      return
    }

    try {
      const state = await invoke<PlaybackState>('pause_playback')
      applyPlaybackState(state, { includeWaveform: false })
    } catch (error) {
      notifyPlaybackError(error)
    }
  }

  async function playSentenceSegment(startMs?: number, endMs?: number): Promise<boolean> {
    if (!canPlaySentenceSegment(startMs, endMs)) {
      return false
    }

    await clearSentenceSegment()
    const playbackToken = ++segmentPlaybackToken
    const segmentEnd = endMs as number

    seeking.value = true
    try {
      const state = await invoke<PlaybackState>('seek_playback', { positionMs: startMs as number })
      if (playbackToken !== segmentPlaybackToken) {
        return false
      }

      activeSegmentEndMs.value = segmentEnd
      applyPlaybackState(state, { includeWaveform: false })
    } catch (error) {
      notifyPlaybackError(error)
      finishSegmentPlayback(false)
      return false
    } finally {
      seeking.value = false
    }

    return await new Promise<boolean>((resolve) => {
      resolveSegmentPlayback = resolve
      segmentMonitorId = setInterval(async () => {
        if (playbackToken !== segmentPlaybackToken) return

        try {
          const state = await invoke<PlaybackState>('get_playback_state')
          if (playbackToken !== segmentPlaybackToken) return

          applyPlaybackState(state, { includeWaveform: false })

          if (state.position_ms >= segmentEnd) {
            if (state.is_playing) {
              const pausedState = await invoke<PlaybackState>('pause_playback')
              if (playbackToken !== segmentPlaybackToken) return
              applyPlaybackState(pausedState, { includeWaveform: false })
            }
            finishSegmentPlayback(true)
            return
          }

          if (!state.is_playing) {
            finishSegmentPlayback(false)
          }
        } catch (error) {
          notifyPlaybackError(error)
          finishSegmentPlayback(false)
        }
      }, 80)
    })
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
    isPlaying, isLooping, currentIndex, volume, lastVolume, showEn, seeking,
    currentPath, positionMs, durationMs, waveformSamples, activeSegmentEndMs,
    applyPlaybackState, applyWaveformPreview, setEstimatedPosition,
    startPlayback, togglePlay, stopPlayback, seekTo,
    canPlaySentenceSegment, clearSentenceSegment, playSentenceSegment,
    toggleLoop, toggleMute, setVolume, setCurrentIndex, prevSentence, nextSentence,
    toggleEn,
  }
})

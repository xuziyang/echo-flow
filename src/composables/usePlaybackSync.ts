import { onBeforeUnmount, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePlayerStore, type PlaybackState } from '../stores/usePlayerStore'

const PLAYBACK_POLL_INTERVAL_MS = 200

type InvokeFn = typeof invoke

interface PlaybackSyncDeps {
  invokeFn?: InvokeFn
  nowMs?: () => number
  requestAnimationFrameFn?: (callback: FrameRequestCallback) => number
  cancelAnimationFrameFn?: (handle: number) => void
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
}

function defaultNowMs() {
  if (typeof window !== 'undefined' && typeof window.performance !== 'undefined') {
    return window.performance.now()
  }
  return Date.now()
}

function defaultRequestAnimationFrame(callback: FrameRequestCallback) {
  if (typeof window === 'undefined') return 0
  return window.requestAnimationFrame(callback)
}

function defaultCancelAnimationFrame(handle: number) {
  if (typeof window === 'undefined') return
  window.cancelAnimationFrame(handle)
}

export function createPlaybackSyncController(
  player = usePlayerStore(),
  {
    invokeFn = invoke,
    nowMs = defaultNowMs,
    requestAnimationFrameFn = defaultRequestAnimationFrame,
    cancelAnimationFrameFn = defaultCancelAnimationFrame,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  }: PlaybackSyncDeps = {},
) {
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let rafId: number | null = null
  let lastSyncPositionMs = 0
  let lastSyncPerfMs = 0

  function stopPositionExtrapolation() {
    if (rafId !== null) {
      cancelAnimationFrameFn(rafId)
      rafId = null
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearIntervalFn(pollTimer)
      pollTimer = null
    }
    stopPositionExtrapolation()
  }

  function calibrateFromState(state: PlaybackState, options?: { includeWaveform?: boolean }) {
    lastSyncPositionMs = state.position_ms
    lastSyncPerfMs = nowMs()
    player.applyPlaybackState(state, options)
  }

  function startPositionExtrapolation() {
    if (rafId !== null) return

    const tick = () => {
      if (!player.isPlaying) {
        stopPositionExtrapolation()
        return
      }

      const elapsed = Math.max(0, nowMs() - lastSyncPerfMs)
      const estimated = Math.round(lastSyncPositionMs + elapsed)
      player.setEstimatedPosition(estimated)
      rafId = requestAnimationFrameFn(tick)
    }

    rafId = requestAnimationFrameFn(tick)
  }

  function startPolling() {
    stopPolling()
    pollTimer = setIntervalFn(async () => {
      try {
        const state = await invokeFn<PlaybackState>('get_playback_state')
        calibrateFromState(state, { includeWaveform: false })

        if (!state.is_playing) {
          stopPolling()
        }
      } catch {
        stopPolling()
      }
    }, PLAYBACK_POLL_INTERVAL_MS)
  }

  function handlePlaybackChange(isPlaying: boolean) {
    if (isPlaying) {
      lastSyncPositionMs = player.positionMs
      lastSyncPerfMs = nowMs()
      startPolling()
      startPositionExtrapolation()
    } else {
      stopPolling()
    }
  }

  return {
    calibrateFromState,
    handlePlaybackChange,
    stopPolling,
  }
}

export function usePlaybackSync() {
  const player = usePlayerStore()
  const controller = createPlaybackSyncController(player)

  watch(
    () => player.isPlaying,
    (isPlaying) => {
      controller.handlePlaybackChange(isPlaying)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    controller.stopPolling()
  })
}

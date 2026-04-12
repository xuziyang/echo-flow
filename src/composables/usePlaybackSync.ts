import { onBeforeUnmount, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { usePlayerStore, type PlaybackState } from '../stores/usePlayerStore'

type UnlistenFn = () => void
type ListenFn = typeof listen
type EventPayload = PlaybackState

interface PlaybackSyncDeps {
  listenFn?: ListenFn
  nowMs?: () => number
  requestAnimationFrameFn?: (callback: FrameRequestCallback) => number
  cancelAnimationFrameFn?: (handle: number) => void
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
    listenFn = listen,
    nowMs = defaultNowMs,
    requestAnimationFrameFn = defaultRequestAnimationFrame,
    cancelAnimationFrameFn = defaultCancelAnimationFrame,
  }: PlaybackSyncDeps = {},
) {
  let rafId: number | null = null
  let lastSyncPositionMs = 0
  let lastSyncPerfMs = 0
  let unlisten: UnlistenFn | null = null

  function stopPositionExtrapolation() {
    if (rafId !== null) {
      cancelAnimationFrameFn(rafId)
      rafId = null
    }
  }

  function stopEventListener() {
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  }

  function stop() {
    stopPositionExtrapolation()
    stopEventListener()
  }

  function calibrateFromState(state: PlaybackState) {
    lastSyncPositionMs = state.position_ms
    lastSyncPerfMs = nowMs()
    player.applyPlaybackState(state, { includeWaveform: false })
  }

  function startPositionExtrapolation() {
    if (rafId !== null) return

    const tick = () => {
      if (!player.isPlaying) {
        stopPositionExtrapolation()
        return
      }

      if (player.seeking) {
        rafId = requestAnimationFrameFn(tick)
        return
      }

      const elapsed = Math.max(0, nowMs() - lastSyncPerfMs)
      const estimated = Math.round(lastSyncPositionMs + elapsed)
      player.setEstimatedPosition(estimated)
      rafId = requestAnimationFrameFn(tick)
    }

    rafId = requestAnimationFrameFn(tick)
  }

  async function startEventListener() {
    stopEventListener()
    unlisten = await listenFn<EventPayload>('playback-state', (event) => {
      calibrateFromState(event.payload)

      if (event.payload.is_playing) {
        startPositionExtrapolation()
      } else {
        stopPositionExtrapolation()
      }
    })
  }

  function handlePlaybackChange(isPlaying: boolean) {
    if (isPlaying) {
      lastSyncPositionMs = player.positionMs
      lastSyncPerfMs = nowMs()
      startEventListener()
      startPositionExtrapolation()
    } else {
      stop()
    }
  }

  return {
    calibrateFromState,
    handlePlaybackChange,
    stop,
    recalibrateAfterSeek,
  }

  function recalibrateAfterSeek() {
    lastSyncPositionMs = player.positionMs
    lastSyncPerfMs = nowMs()
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

  watch(
    () => player.seeking,
    (isSeeking, wasSeeking) => {
      if (wasSeeking && !isSeeking) {
        controller.recalibrateAfterSeek()
      }
    },
  )

  onBeforeUnmount(() => {
    controller.stop()
  })
}

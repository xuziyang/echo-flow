import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore, type PlaybackState } from '../stores/usePlayerStore'
import { createPlaybackSyncController } from './usePlaybackSync'

describe('usePlaybackSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('polls backend state and stops when playback ends', async () => {
    const player = usePlayerStore()
    player.waveformSamples = [0.7, 0.6]
    player.positionMs = 1000
    player.durationMs = 5000
    player.isPlaying = true

    const invokeMock = vi.fn<(...args: unknown[]) => Promise<PlaybackState>>().mockResolvedValue({
      path: '/tmp/audio.mp3',
      is_playing: false,
      position_ms: 2200,
      duration_ms: 5000,
      volume: 1,
      waveform_samples: [0.1, 0.2],
    })

    const controller = createPlaybackSyncController(player, {
      invokeFn: invokeMock as never,
      nowMs: () => 1000,
      requestAnimationFrameFn: vi.fn(() => 1),
      cancelAnimationFrameFn: vi.fn(),
    })

    controller.handlePlaybackChange(true)
    await vi.advanceTimersByTimeAsync(200)

    expect(invokeMock).toHaveBeenCalledWith('get_playback_state')
    expect(player.positionMs).toBe(2200)
    expect(player.isPlaying).toBe(false)
    expect(player.waveformSamples).toEqual([0.7, 0.6])

    await vi.advanceTimersByTimeAsync(400)
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('extrapolates position while playing and stops on dispose', () => {
    const player = usePlayerStore()
    player.positionMs = 1000
    player.durationMs = 5000
    player.isPlaying = true

    let now = 1000
    const frameCallbacks: Array<(timestamp: number) => void> = []
    const requestAnimationFrameFn = vi.fn((callback: (timestamp: number) => void) => {
      frameCallbacks.push(callback)
      return 11
    })
    const cancelAnimationFrameFn = vi.fn()

    const controller = createPlaybackSyncController(player, {
      invokeFn: vi.fn() as never,
      nowMs: () => now,
      requestAnimationFrameFn,
      cancelAnimationFrameFn,
      setIntervalFn: vi.fn(() => 1) as never,
      clearIntervalFn: vi.fn() as never,
    })

    controller.handlePlaybackChange(true)

    now = 1350
    const firstFrame = frameCallbacks[0]
    if (firstFrame) {
      firstFrame(0)
    }

    expect(player.positionMs).toBe(1350)

    controller.stopPolling()
    expect(cancelAnimationFrameFn).toHaveBeenCalledWith(11)
  })

  it('skips extrapolation while seeking', () => {
    const player = usePlayerStore()
    player.positionMs = 1000
    player.durationMs = 5000
    player.isPlaying = true

    let now = 1000
    const frameCallbacks: Array<(timestamp: number) => void> = []
    const requestAnimationFrameFn = vi.fn((callback: (timestamp: number) => void) => {
      frameCallbacks.push(callback)
      return 11
    })

    const controller = createPlaybackSyncController(player, {
      invokeFn: vi.fn() as never,
      nowMs: () => now,
      requestAnimationFrameFn,
      cancelAnimationFrameFn: vi.fn(),
      setIntervalFn: vi.fn(() => 1) as never,
      clearIntervalFn: vi.fn() as never,
    })

    controller.handlePlaybackChange(true)

    now = 1350
    player.seeking = true
    const frame = frameCallbacks[frameCallbacks.length - 1]
    if (frame) frame(0)

    expect(player.positionMs).toBe(1000)

    player.seeking = false
    controller.recalibrateAfterSeek()
    now = 1400
    const frame2 = frameCallbacks[frameCallbacks.length - 1]
    if (frame2) frame2(0)

    expect(player.positionMs).toBe(1050)
  })
})

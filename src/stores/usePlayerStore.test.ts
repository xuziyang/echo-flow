import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore, type PlaybackState } from './usePlayerStore'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

describe('usePlayerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    vi.useRealTimers()
  })

  it('applies playback state including waveform data by default', () => {
    const player = usePlayerStore()
    const state: PlaybackState = {
      path: '/tmp/audio.mp3',
      is_playing: true,
      position_ms: 1250,
      duration_ms: 4800,
      volume: 0.8,
      waveform_samples: [0.1, 0.4, 0.2],
    }

    player.applyPlaybackState(state)

    expect(player.currentPath).toBe('/tmp/audio.mp3')
    expect(player.isPlaying).toBe(true)
    expect(player.positionMs).toBe(1250)
    expect(player.durationMs).toBe(4800)
    expect(player.waveformSamples).toEqual([0.1, 0.4, 0.2])
  })

  it('keeps existing waveform data when includeWaveform is false', () => {
    const player = usePlayerStore()
    player.waveformSamples = [0.9, 0.8]

    const state: PlaybackState = {
      path: '/tmp/audio.mp3',
      is_playing: false,
      position_ms: 2000,
      duration_ms: 5000,
      volume: 0.5,
      waveform_samples: [0.1, 0.2],
    }

    player.applyPlaybackState(state, { includeWaveform: false })

    expect(player.waveformSamples).toEqual([0.9, 0.8])
    expect(player.positionMs).toBe(2000)
    expect(player.isPlaying).toBe(false)
  })

  it('clamps estimated position to loaded duration', () => {
    const player = usePlayerStore()
    player.durationMs = 3200

    player.setEstimatedPosition(4000)
    expect(player.positionMs).toBe(3200)

    player.setEstimatedPosition(-120)
    expect(player.positionMs).toBe(0)
  })

  it('blocks estimated position updates while seeking', () => {
    const player = usePlayerStore()
    player.durationMs = 5000
    player.positionMs = 1000
    player.seeking = true

    player.setEstimatedPosition(3000)
    expect(player.positionMs).toBe(1000)

    player.seeking = false
    player.setEstimatedPosition(3000)
    expect(player.positionMs).toBe(3000)
  })

  it('does not start sentence playback when timing data is missing', async () => {
    const player = usePlayerStore()
    player.currentPath = '/tmp/audio.mp3'

    await expect(player.playSentenceSegment(undefined, 1500)).resolves.toBe(false)
    await expect(player.playSentenceSegment(1500, 1500)).resolves.toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('plays the current sentence segment and pauses at the end', async () => {
    vi.useFakeTimers()
    const player = usePlayerStore()
    player.applyPlaybackState({
      path: '/tmp/audio.mp3',
      is_playing: false,
      position_ms: 0,
      duration_ms: 5000,
      volume: 0.8,
      waveform_samples: [],
    })

    const seekState: PlaybackState = {
      path: '/tmp/audio.mp3',
      is_playing: true,
      position_ms: 1200,
      duration_ms: 5000,
      volume: 0.8,
      waveform_samples: [],
    }

    const nearEndState: PlaybackState = {
      ...seekState,
      position_ms: 1480,
    }

    const pastEndState: PlaybackState = {
      ...seekState,
      position_ms: 1630,
    }

    const pausedState: PlaybackState = {
      ...seekState,
      is_playing: false,
      position_ms: 1630,
    }

    invokeMock.mockImplementation((command: string) => {
      if (command === 'seek_playback') return Promise.resolve(seekState)
      if (command === 'get_playback_state') {
        const next = invokeMock.mock.calls.filter(([name]) => name === 'get_playback_state').length === 1
          ? nearEndState
          : pastEndState
        return Promise.resolve(next)
      }
      if (command === 'pause_playback') return Promise.resolve(pausedState)
      return Promise.reject(new Error(`Unexpected command: ${command}`))
    })

    const playbackPromise = player.playSentenceSegment(1200, 1600)

    await vi.advanceTimersByTimeAsync(200)
    await expect(playbackPromise).resolves.toBe(true)

    expect(invokeMock).toHaveBeenCalledWith('seek_playback', { positionMs: 1200 })
    expect(invokeMock).toHaveBeenCalledWith('pause_playback')
    expect(player.activeSegmentEndMs).toBe(null)
    expect(player.isPlaying).toBe(false)
    expect(player.positionMs).toBe(1630)
  })
})

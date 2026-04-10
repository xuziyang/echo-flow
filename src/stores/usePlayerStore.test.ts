import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore, type PlaybackState } from './usePlayerStore'

describe('usePlayerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})

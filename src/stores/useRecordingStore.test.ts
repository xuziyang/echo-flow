import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from './usePlayerStore'
import { useRecordingStore } from './useRecordingStore'
import { useTranscriptStore } from './useTranscriptStore'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

class MockAudio {
  static instances: MockAudio[] = []

  src: string
  currentTime = 0
  paused = false
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(async () => undefined)
  pause = vi.fn(() => {
    this.paused = true
  })

  constructor(src: string) {
    this.src = src
    MockAudio.instances.push(this)
  }
}

describe('useRecordingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    MockAudio.instances = []
    vi.stubGlobal('Audio', MockAudio)
  })

  it('keeps only one active recording audio instance at a time', async () => {
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)

    const recording = useRecordingStore()
    recording.userAudioUrl = 'blob:recording'

    await recording.playUserRecording()
    const firstAudio = MockAudio.instances[0]

    await recording.playUserRecording()
    const secondAudio = MockAudio.instances[1]

    expect(firstAudio.pause).toHaveBeenCalled()
    expect(firstAudio.currentTime).toBe(0)
    expect(secondAudio.play).toHaveBeenCalled()
    expect(recording.activePlaybackMode).toBe('recording')

    secondAudio.onended?.()
    expect(recording.activePlaybackMode).toBe(null)
  })

  it('plays the current sentence first when starting comparison playback', async () => {
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    player.playSentenceSegment = vi.fn().mockResolvedValue(true)

    const transcript = useTranscriptStore()
    transcript.sentences = [{
      id: 1,
      en: 'hello world',
      status: 'saved',
      dirty: false,
      issues: [],
      start_ms: 500,
      end_ms: 1500,
    }]

    const recording = useRecordingStore()
    recording.userAudioUrl = 'blob:recording'

    await recording.playComparison()

    expect(player.playSentenceSegment).toHaveBeenCalledWith(500, 1500)
    expect(MockAudio.instances).toHaveLength(1)
    expect(recording.activePlaybackMode).toBe('comparison')
  })
})

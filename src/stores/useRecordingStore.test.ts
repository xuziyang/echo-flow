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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function seedCurrentSentence() {
  const player = usePlayerStore()
  player.currentPath = '/tmp/audio.mp3'

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

  it('repeats the current original sentence when loop is enabled until stopped', async () => {
    seedCurrentSentence()
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    const segmentPlays: Array<ReturnType<typeof deferred<boolean>>> = []
    player.playSentenceSegment = vi.fn(() => {
      const next = deferred<boolean>()
      segmentPlays.push(next)
      return next.promise
    })

    const recording = useRecordingStore()
    recording.setLoopEnabled(true)

    const loopPromise = recording.playOriginal()
    await flushPromises()

    expect(recording.activeLoopMode).toBe('original')
    expect(player.playSentenceSegment).toHaveBeenCalledTimes(1)
    expect(player.playSentenceSegment).toHaveBeenCalledWith(500, 1500)

    segmentPlays[0].resolve(true)
    await flushPromises()

    expect(player.playSentenceSegment).toHaveBeenCalledTimes(2)

    await recording.playOriginal()
    expect(recording.activeLoopMode).toBe(null)

    segmentPlays[1].resolve(true)
    await loopPromise
    expect(player.playSentenceSegment).toHaveBeenCalledTimes(2)
  })

  it('repeats original then recording when loop is enabled until stopped', async () => {
    seedCurrentSentence()
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    player.playSentenceSegment = vi.fn().mockResolvedValue(true)

    const recording = useRecordingStore()
    recording.userAudioUrl = 'blob:recording'
    recording.setLoopEnabled(true)

    const loopPromise = recording.playComparison()
    await flushPromises()

    expect(recording.activeLoopMode).toBe('comparison')
    expect(player.playSentenceSegment).toHaveBeenCalledTimes(1)
    expect(MockAudio.instances).toHaveLength(1)
    expect(recording.activePlaybackMode).toBe('comparison')

    MockAudio.instances[0].onended?.()
    await flushPromises()
    await flushPromises()

    expect(player.playSentenceSegment).toHaveBeenCalledTimes(2)
    expect(MockAudio.instances).toHaveLength(2)

    await recording.playComparison()
    expect(recording.activeLoopMode).toBe(null)

    MockAudio.instances[1].onended?.()
    await loopPromise
    expect(player.playSentenceSegment).toHaveBeenCalledTimes(2)
  })

  it('stops an active loop through stopPlayback and does not start another round', async () => {
    seedCurrentSentence()
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    const firstPlayback = deferred<boolean>()
    player.playSentenceSegment = vi.fn().mockReturnValue(firstPlayback.promise)

    const recording = useRecordingStore()
    recording.setLoopEnabled(true)

    const loopPromise = recording.playOriginal()
    await flushPromises()

    await recording.stopPlayback()
    expect(recording.activeLoopMode).toBe(null)

    firstPlayback.resolve(true)
    await loopPromise
    expect(player.playSentenceSegment).toHaveBeenCalledTimes(1)
  })

  it('stops an active loop before starting a new recording', async () => {
    seedCurrentSentence()
    invokeMock.mockResolvedValue(undefined)

    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    const firstPlayback = deferred<boolean>()
    player.playSentenceSegment = vi.fn().mockReturnValue(firstPlayback.promise)

    const recording = useRecordingStore()
    recording.setLoopEnabled(true)

    const loopPromise = recording.playOriginal()
    await flushPromises()

    await recording.toggleRecording()
    expect(recording.activeLoopMode).toBe(null)
    expect(recording.isRecording).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('start_recording')

    firstPlayback.resolve(true)
    await loopPromise
    expect(player.playSentenceSegment).toHaveBeenCalledTimes(1)
  })

  it('does not enter loop playback without required inputs', async () => {
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    player.playSentenceSegment = vi.fn().mockResolvedValue(false)

    const recording = useRecordingStore()

    recording.setLoopEnabled(true)
    await recording.playOriginal()
    expect(recording.activeLoopMode).toBe(null)

    seedCurrentSentence()
    await recording.playComparison()
    expect(recording.activeLoopMode).toBe(null)
    expect(MockAudio.instances).toHaveLength(0)
  })

  it('turns off active loop playback when the loop switch is disabled', async () => {
    seedCurrentSentence()
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    const firstPlayback = deferred<boolean>()
    player.playSentenceSegment = vi.fn().mockReturnValue(firstPlayback.promise)

    const recording = useRecordingStore()
    recording.setLoopEnabled(true)

    const loopPromise = recording.playOriginal()
    await flushPromises()

    recording.setLoopEnabled(false)
    await flushPromises()

    expect(recording.loopEnabled).toBe(false)
    expect(recording.activeLoopMode).toBe(null)

    firstPlayback.resolve(true)
    await loopPromise
    expect(player.playSentenceSegment).toHaveBeenCalledTimes(1)
  })

  it('starts recording after one-shot original playback when auto record is enabled', async () => {
    seedCurrentSentence()
    invokeMock.mockResolvedValue(undefined)

    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    player.playSentenceSegment = vi.fn().mockResolvedValue(true)

    const recording = useRecordingStore()
    recording.setAutoRecordEnabled(true)

    await recording.playOriginal()

    expect(player.playSentenceSegment).toHaveBeenCalledWith(500, 1500)
    expect(invokeMock).toHaveBeenCalledWith('start_recording')
    expect(recording.isRecording).toBe(true)
  })

  it('does not auto record when original playback cannot start', async () => {
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    player.playSentenceSegment = vi.fn().mockResolvedValue(false)

    const recording = useRecordingStore()
    recording.setAutoRecordEnabled(true)

    await recording.playOriginal()

    expect(invokeMock).not.toHaveBeenCalledWith('start_recording')
    expect(recording.isRecording).toBe(false)
  })

  it('keeps loop playback behavior when loop and auto record are both enabled', async () => {
    seedCurrentSentence()
    const player = usePlayerStore()
    player.clearSentenceSegment = vi.fn().mockResolvedValue(undefined)
    const firstPlayback = deferred<boolean>()
    player.playSentenceSegment = vi.fn().mockReturnValue(firstPlayback.promise)

    const recording = useRecordingStore()
    recording.setAutoRecordEnabled(true)
    recording.setLoopEnabled(true)

    const loopPromise = recording.playOriginal()
    await flushPromises()

    expect(recording.activeLoopMode).toBe('original')
    expect(invokeMock).not.toHaveBeenCalledWith('start_recording')

    await recording.playOriginal()
    firstPlayback.resolve(true)
    await loopPromise
  })
})

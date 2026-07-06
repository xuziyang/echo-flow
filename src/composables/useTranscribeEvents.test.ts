import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTranscriptStore } from '../stores/useTranscriptStore'
import { createTranscribeEventBindings } from './useTranscribeEvents'

describe('useTranscribeEvents', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registers listeners once, forwards payloads, and disposes them', async () => {
    const transcript = useTranscriptStore()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()
    const unlisteners = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    const listenMock = vi.fn(async (eventName: string, callback: (event: { payload: unknown }) => void) => {
      callbacks.set(eventName, callback)
      return unlisteners[listenMock.mock.calls.length - 1] ?? vi.fn()
    })

    const bindings = createTranscribeEventBindings(transcript, listenMock as never)
    const progressSpy = vi.spyOn(transcript, 'applyTranscribeProgress')
    const doneSpy = vi.spyOn(transcript, 'applyTranscribeDone')
    const textsDoneSpy = vi.spyOn(transcript, 'applyRegenerateTextsDone')
    const errorSpy = vi.spyOn(transcript, 'applyTranscribeError')

    await bindings.initTranscribeListeners()
    await bindings.initTranscribeListeners()

    expect(listenMock).toHaveBeenCalledTimes(4)

    callbacks.get('transcribe-progress')?.({
      payload: { job_id: 1, audio_path: '/tmp/a.mp3', percent: 25, sentence: 'hi', done: false },
    })
    callbacks.get('transcribe-done')?.({
      payload: { job_id: 1, audio_path: '/tmp/a.mp3', segments: [] },
    })
    callbacks.get('transcribe-texts-done')?.({
      payload: { job_id: 1, audio_path: '/tmp/a.mp3', updates: [] },
    })
    callbacks.get('transcribe-error')?.({
      payload: { job_id: 1, audio_path: '/tmp/a.mp3', error: 'boom' },
    })

    expect(progressSpy).toHaveBeenCalledTimes(1)
    expect(doneSpy).toHaveBeenCalledTimes(1)
    expect(textsDoneSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    bindings.disposeTranscribeListeners()

    expect(unlisteners[0]).toHaveBeenCalledTimes(1)
    expect(unlisteners[1]).toHaveBeenCalledTimes(1)
    expect(unlisteners[2]).toHaveBeenCalledTimes(1)
    expect(unlisteners[3]).toHaveBeenCalledTimes(1)

    expect(progressSpy).toHaveBeenCalledTimes(1)
    expect(doneSpy).toHaveBeenCalledTimes(1)
    expect(textsDoneSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

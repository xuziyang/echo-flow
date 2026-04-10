import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useTranscriptStore,
  type TranscribeDoneEvent,
  type TranscribeErrorEvent,
  type TranscribeProgressEvent,
} from './useTranscriptStore'

describe('useTranscriptStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not enter edit mode when there are no sentences', () => {
    const transcript = useTranscriptStore()

    transcript.enterEditMode()

    expect(transcript.isEditing).toBe(false)
    expect(transcript.editingIndex).toBe(null)
    expect(transcript.draftSentences).toEqual([])
  })

  it('ignores stale transcription progress and applies matching events', () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    transcript.activeTranscribeJobId = 7
    transcript.isTranscribing = true

    const staleProgress: TranscribeProgressEvent = {
      job_id: 6,
      audio_path: '/tmp/other.mp3',
      percent: 42,
      sentence: 'stale',
      done: false,
    }
    const currentProgress: TranscribeProgressEvent = {
      job_id: 7,
      audio_path: '/tmp/current.mp3',
      percent: 64,
      sentence: 'current',
      done: false,
    }

    transcript.applyTranscribeProgress(staleProgress)
    expect(transcript.transcribeProgress).toBe(0)

    transcript.applyTranscribeProgress(currentProgress)
    expect(transcript.transcribeProgress).toBe(64)
  })

  it('applies matching done events and clears active job state', () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    transcript.activeTranscribeJobId = 9
    transcript.isTranscribing = true

    const doneEvent: TranscribeDoneEvent = {
      job_id: 9,
      audio_path: '/tmp/current.mp3',
      segments: [
        { id: 1, en: 'Hello there.', start_ms: 0, end_ms: 500 },
        { id: 2, en: 'General Kenobi.', start_ms: 520, end_ms: 1100 },
      ],
    }

    transcript.applyTranscribeDone(doneEvent)

    expect(transcript.sentences).toHaveLength(2)
    expect(transcript.sentences[0]?.en).toBe('Hello there.')
    expect(transcript.transcribeProgress).toBe(100)
    expect(transcript.isTranscribing).toBe(false)
    expect(transcript.activeTranscribeJobId).toBe(null)
  })

  it('applies matching error events and clears active job state', () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    transcript.activeTranscribeJobId = 3
    transcript.isTranscribing = true

    const errorEvent: TranscribeErrorEvent = {
      job_id: 3,
      audio_path: '/tmp/current.mp3',
      error: 'transcription failed',
    }

    transcript.applyTranscribeError(errorEvent)

    expect(transcript.transcribeError).toBe('transcription failed')
    expect(transcript.isTranscribing).toBe(false)
    expect(transcript.activeTranscribeJobId).toBe(null)
  })
})

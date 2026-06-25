import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useTranscriptStore,
  type Sentence,
  type TranscribeDoneEvent,
  type TranscribeErrorEvent,
  type TranscribeProgressEvent,
} from './useTranscriptStore'
import { usePlayerStore } from './usePlayerStore'

function sentence(overrides: Partial<Sentence> = {}): Sentence {
  return {
    id: 1,
    en: 'Hello there.',
    status: 'saved',
    dirty: false,
    issues: [],
    start_ms: 0,
    end_ms: 1000,
    ...overrides,
  }
}

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

  it('does not split a sentence when the cursor is at an empty edge', () => {
    const transcript = useTranscriptStore()
    transcript.sentences = [sentence({ en: 'Hello there.' })]
    transcript.enterEditMode()

    expect(transcript.splitSentence(0, 0)).toBe(false)
    expect(transcript.splitSentence(0, 'Hello there.'.length)).toBe(false)
    expect(transcript.draftSentences).toHaveLength(1)
    expect(transcript.hasUnsavedChanges).toBe(false)
  })

  it('splits a sentence at the cursor and marks both draft entries', () => {
    const transcript = useTranscriptStore()
    transcript.sentences = [sentence({ id: 7, en: 'Hello there friend.', start_ms: 100, end_ms: 1100 })]
    transcript.enterEditMode()

    expect(transcript.splitSentence(0, 12)).toBe(true)

    expect(transcript.draftSentences).toHaveLength(2)
    expect(transcript.draftSentences[0]).toMatchObject({
      id: 7,
      en: 'Hello there',
      status: 'changed',
      dirty: true,
      start_ms: 100,
      end_ms: 732,
    })
    expect(transcript.draftSentences[1]).toMatchObject({
      id: 8,
      en: 'friend.',
      status: 'new',
      dirty: true,
      start_ms: 732,
      end_ms: 1100,
    })
    expect(transcript.editingIndex).toBe(1)
    expect(transcript.hasUnsavedChanges).toBe(true)
  })

  it('keeps split timestamps continuous and ordered', () => {
    const transcript = useTranscriptStore()
    transcript.sentences = [sentence({ en: 'abcd', start_ms: 10, end_ms: 14 })]
    transcript.enterEditMode()

    transcript.splitSentence(0, 2)

    const left = transcript.draftSentences[0]
    const right = transcript.draftSentences[1]
    expect(left?.start_ms).toBe(10)
    expect(left?.end_ms).toBe(right?.start_ms)
    expect(right?.end_ms).toBe(14)
    expect(left?.end_ms).toBeGreaterThan(left?.start_ms ?? 0)
    expect(right?.end_ms).toBeGreaterThan(right?.start_ms ?? 0)
  })

  it('merges a sentence with the previous draft and reconciles indices', () => {
    const transcript = useTranscriptStore()
    const player = usePlayerStore()
    transcript.sentences = [
      sentence({ id: 1, en: 'Hello', start_ms: 100, end_ms: 500 }),
      sentence({ id: 2, en: 'there', start_ms: 520, end_ms: 900 }),
      sentence({ id: 3, en: 'friend', start_ms: 920, end_ms: 1200 }),
    ]
    player.setCurrentIndex(2)
    transcript.enterEditMode()

    expect(transcript.mergeWithPrev(1)).toBe(true)

    expect(transcript.draftSentences).toHaveLength(2)
    expect(transcript.draftSentences[0]).toMatchObject({
      en: 'Hello there',
      status: 'editing',
      dirty: true,
      start_ms: 100,
      end_ms: 900,
    })
    expect(transcript.editingIndex).toBe(0)
    expect(player.currentIndex).toBe(1)
  })

  it('merges a sentence with the next draft and saves all statuses as saved', () => {
    const transcript = useTranscriptStore()
    transcript.sentences = [
      sentence({ id: 1, en: 'Hello', start_ms: 100, end_ms: 500 }),
      sentence({ id: 2, en: 'there', start_ms: 520, end_ms: 900 }),
    ]
    transcript.enterEditMode()

    expect(transcript.mergeWithNext(0)).toBe(true)

    expect(transcript.draftSentences).toHaveLength(1)
    expect(transcript.draftSentences[0]).toMatchObject({
      en: 'Hello there',
      status: 'editing',
      dirty: true,
      start_ms: 100,
      end_ms: 900,
    })

    transcript.saveEdits()

    expect(transcript.isEditing).toBe(false)
    expect(transcript.sentences).toHaveLength(1)
    expect(transcript.sentences[0]).toMatchObject({
      en: 'Hello there',
      status: 'saved',
      dirty: false,
      start_ms: 100,
      end_ms: 900,
    })
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
    expect(transcript.transcribeStatus).toBe('current')
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
    expect(transcript.transcribeStatus).toBe('Subtitles ready')
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
    expect(transcript.transcribeStatus).toBe('Transcription failed')
    expect(transcript.isTranscribing).toBe(false)
    expect(transcript.activeTranscribeJobId).toBe(null)
  })
})

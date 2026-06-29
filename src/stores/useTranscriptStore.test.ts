import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

import {
  useTranscriptStore,
  type Sentence,
  type TranscribeDoneEvent,
  type TranscribeErrorEvent,
  type TranscribeProgressEvent,
} from './useTranscriptStore'
import { useAppStore } from './useAppStore'
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

function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('useTranscriptStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
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

  it('does not split a sentence in the middle of a word', () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    transcript.sentences = [sentence({ id: 7, en: 'Hello there.', start_ms: 100, end_ms: 1100 })]
    transcript.enterEditMode()

    expect(transcript.splitSentence(0, 2)).toBe(false)

    expect(transcript.draftSentences).toHaveLength(1)
    expect(transcript.draftSentences[0]?.en).toBe('Hello there.')
    expect(transcript.hasUnsavedChanges).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
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

  it('keeps estimated split timing while async alignment is pending', async () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    invokeMock.mockReturnValue(new Promise(() => {}))
    transcript.sentences = [sentence({ id: 7, en: 'Hello there friend.', start_ms: 100, end_ms: 1100 })]
    transcript.enterEditMode()

    expect(transcript.splitSentence(0, 12)).toBe(true)

    expect(transcript.draftSentences[0]).toMatchObject({ start_ms: 100, end_ms: 732 })
    expect(transcript.draftSentences[1]).toMatchObject({ start_ms: 732, end_ms: 1100 })
    expect(transcript.isSentenceAligning(7)).toBe(true)
    expect(transcript.isSentenceAligning(8)).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('align_split_sentence', {
      audioPath: '/tmp/current.mp3',
      startMs: 100,
      endMs: 1100,
      leftText: 'Hello there',
      rightText: 'friend.',
      modelDir: null,
    })

    await flushPromises()
  })

  it('updates split timing when async alignment succeeds', async () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    invokeMock.mockImplementation((command: string) => {
      if (command === 'align_split_sentence') {
        return Promise.resolve({
          left: { start_ms: 120, end_ms: 620 },
          right: { start_ms: 650, end_ms: 1040 },
        })
      }
      return Promise.resolve(undefined)
    })
    transcript.sentences = [sentence({ id: 7, en: 'Hello there friend.', start_ms: 100, end_ms: 1100 })]
    transcript.enterEditMode()

    transcript.splitSentence(0, 12)
    await flushPromises()

    expect(transcript.draftSentences[0]).toMatchObject({ start_ms: 120, end_ms: 620 })
    expect(transcript.draftSentences[1]).toMatchObject({ start_ms: 650, end_ms: 1040 })
    expect(transcript.isSentenceAligning(7)).toBe(false)
    expect(transcript.isSentenceAligning(8)).toBe(false)
    expect(invokeMock).toHaveBeenCalledWith('save_transcription_cache_subtitles', {
      audioPath: '/tmp/current.mp3',
      entries: [
        { id: 7, en: 'Hello there', start_ms: 120, end_ms: 620 },
        { id: 8, en: 'friend.', start_ms: 650, end_ms: 1040 },
      ],
      modelPath: null,
      whisperModel: 'whisper-base',
      modelDir: null,
    })
  })

  it('keeps estimated split timing when async alignment fails', async () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    invokeMock.mockRejectedValue('alignment unavailable')
    transcript.sentences = [sentence({ id: 7, en: 'Hello there friend.', start_ms: 100, end_ms: 1100 })]
    transcript.enterEditMode()

    transcript.splitSentence(0, 12)
    await flushPromises()

    expect(transcript.draftSentences[0]).toMatchObject({ start_ms: 100, end_ms: 732 })
    expect(transcript.draftSentences[1]).toMatchObject({ start_ms: 732, end_ms: 1100 })
    expect(transcript.isSentenceAligning(7)).toBe(false)
    expect(transcript.isSentenceAligning(8)).toBe(false)
  })

  it('does not apply stale alignment results after the split text changes', async () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    let resolveAlignment!: (value: unknown) => void
    invokeMock.mockReturnValue(new Promise(resolve => {
      resolveAlignment = resolve
    }))
    transcript.sentences = [sentence({ id: 7, en: 'Hello there friend.', start_ms: 100, end_ms: 1100 })]
    transcript.enterEditMode()

    transcript.splitSentence(0, 12)
    transcript.updateDraft(0, 'Hello there!')
    resolveAlignment({
      left: { start_ms: 120, end_ms: 620 },
      right: { start_ms: 650, end_ms: 1040 },
    })
    await flushPromises()

    expect(transcript.draftSentences[0]).toMatchObject({
      en: 'Hello there!',
      start_ms: 100,
      end_ms: 732,
    })
    expect(transcript.draftSentences[1]).toMatchObject({ start_ms: 732, end_ms: 1100 })
  })

  it('keeps split timestamps continuous and ordered', () => {
    const transcript = useTranscriptStore()
    transcript.sentences = [sentence({ en: 'ab cd', start_ms: 10, end_ms: 14 })]
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

  it('merges a sentence with the next draft and saves all statuses as saved', async () => {
    const transcript = useTranscriptStore()
    transcript.currentAudioPath = '/tmp/current.mp3'
    invokeMock.mockResolvedValue(undefined)
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

    await transcript.saveEdits()

    expect(transcript.isEditing).toBe(false)
    expect(transcript.sentences).toHaveLength(1)
    expect(transcript.sentences[0]).toMatchObject({
      en: 'Hello there',
      status: 'saved',
      dirty: false,
      start_ms: 100,
      end_ms: 900,
    })
    expect(invokeMock).toHaveBeenCalledWith('save_transcription_cache_subtitles', {
      audioPath: '/tmp/current.mp3',
      entries: [{ id: 1, en: 'Hello there', start_ms: 100, end_ms: 900 }],
      modelPath: null,
      whisperModel: 'whisper-base',
      modelDir: null,
    })
  })

  it('starts normal transcription without forcing regeneration and clears old subtitles', async () => {
    const transcript = useTranscriptStore()
    invokeMock.mockResolvedValue(12)
    transcript.sentences = [sentence({ id: 7, en: 'Old cached subtitle.' })]

    await transcript.startTranscribe('/tmp/current.mp3')

    expect(transcript.sentences).toEqual([])
    expect(transcript.isTranscribing).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('transcribe_audio', {
      audioPath: '/tmp/current.mp3',
      modelPath: null,
      whisperModel: 'whisper-base',
      modelDir: null,
      jobId: 1,
      forceRegenerate: false,
    })
  })

  it('regenerates subtitles by forcing transcription while preserving existing subtitles', async () => {
    const transcript = useTranscriptStore()
    invokeMock.mockResolvedValue(13)
    transcript.currentAudioPath = '/tmp/current.mp3'
    transcript.sentences = [sentence({ id: 7, en: 'Keep this until new subtitles arrive.' })]

    await transcript.regenerateSubtitles()

    expect(transcript.sentences).toHaveLength(1)
    expect(transcript.sentences[0]?.en).toBe('Keep this until new subtitles arrive.')
    expect(transcript.isTranscribing).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('delete_recordings_for_audio', {
      audioPath: '/tmp/current.mp3',
    })
    expect(invokeMock).toHaveBeenCalledWith('transcribe_audio', {
      audioPath: '/tmp/current.mp3',
      modelPath: null,
      whisperModel: 'whisper-base',
      modelDir: null,
      jobId: 1,
      forceRegenerate: true,
    })
  })

  it('keeps existing subtitles when regeneration fails to start', async () => {
    const transcript = useTranscriptStore()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'delete_recordings_for_audio') return Promise.resolve(undefined)
      if (command === 'transcribe_audio') return Promise.reject('startup failed')
      return Promise.resolve(undefined)
    })
    transcript.currentAudioPath = '/tmp/current.mp3'
    transcript.sentences = [sentence({ id: 7, en: 'Still here.' })]

    await transcript.regenerateSubtitles()

    expect(transcript.sentences).toHaveLength(1)
    expect(transcript.sentences[0]?.en).toBe('Still here.')
    expect(transcript.transcribeError).toBe('startup failed')
    expect(transcript.transcribeStatus).toBe('Transcription failed')
    expect(transcript.isTranscribing).toBe(false)
  })

  it('does not regenerate when current audio recordings cannot be deleted', async () => {
    const transcript = useTranscriptStore()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'delete_recordings_for_audio') return Promise.reject('delete failed')
      return Promise.resolve(undefined)
    })
    transcript.currentAudioPath = '/tmp/current.mp3'
    transcript.sentences = [sentence({ id: 7, en: 'Still here.' })]

    await transcript.regenerateSubtitles()

    expect(transcript.sentences).toHaveLength(1)
    expect(transcript.sentences[0]?.en).toBe('Still here.')
    expect(transcript.isTranscribing).toBe(false)
    expect(invokeMock).not.toHaveBeenCalledWith('transcribe_audio', expect.anything())
  })

  it('does not regenerate when no audio is loaded', async () => {
    const transcript = useTranscriptStore()
    const app = useAppStore()

    await transcript.regenerateSubtitles()

    expect(invokeMock).not.toHaveBeenCalled()
    expect(app.toast).toBe('Load an audio file before regenerating subtitles')
    expect(app.toastType).toBe('error')
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

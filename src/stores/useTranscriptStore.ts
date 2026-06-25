// src/stores/useTranscriptStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'
import { usePlayerStore } from './usePlayerStore'
import { useSettingsStore } from './useSettingsStore'

export interface Sentence {
  id: number
  en: string
  status: 'saved' | 'new' | 'changed' | 'editing'
  dirty: boolean
  issues: string[]
  start_ms?: number
  end_ms?: number
}

export interface SubtitleEntry {
  id: number
  en: string
  start_ms?: number
  end_ms?: number
}

export interface WordToken {
  text: string
  start_ms: number
  end_ms: number
}

export interface TranscriptSegment {
  id: number
  en: string
  start_ms: number
  end_ms: number
  words?: WordToken[]
}

export interface TranscribeProgress {
  percent: number
  sentence: string
  done: boolean
}

export interface TranscribeProgressEvent extends TranscribeProgress {
  job_id: number
  audio_path: string
}

export interface TranscribeDoneEvent {
  job_id: number
  audio_path: string
  segments: TranscriptSegment[]
}

export interface TranscribeErrorEvent {
  job_id: number
  audio_path: string
  error: string
}

export const useTranscriptStore = defineStore('transcript', () => {
  const app = useAppStore()
  const sentences = ref<Sentence[]>([])
  const isEditing = ref(false)
  const editingIndex = ref<number | null>(null)
  const draftSentences = ref<Sentence[]>([])
  const hasUnsavedChanges = ref(false)
  const isTranscribing = ref(false)
  const transcribeProgress = ref(0)
  const transcribeStatus = ref('')
  const transcribeError = ref<string | null>(null)
  const sentenceIdCounter = ref(1)
  const currentAudioPath = ref('')
  const activeTranscribeJobId = ref<number | null>(null)

  let nextTranscribeJobId = 1

  const displaySentences = computed(() => isEditing.value ? draftSentences.value : sentences.value)

  function resetEditingState() {
    isEditing.value = false
    editingIndex.value = null
    draftSentences.value = []
    hasUnsavedChanges.value = false
  }

  function cloneSentence(s: Sentence): Sentence {
    return { ...s, issues: [...s.issues] }
  }

  function nextSentenceId(): number {
    return sentenceIdCounter.value++
  }

  function resetSentenceIdCounter() {
    sentenceIdCounter.value = Math.max(0, ...sentences.value.map(s => s.id)) + 1
  }

  function markSentenceDirty(sentence: Sentence, status: Sentence['status'] = 'changed') {
    sentence.dirty = true
    sentence.status = status
    hasUnsavedChanges.value = true
  }

  function hasValidTimeRange(sentence: Sentence): sentence is Sentence & { start_ms: number; end_ms: number } {
    return Number.isFinite(sentence.start_ms)
      && Number.isFinite(sentence.end_ms)
      && (sentence.start_ms as number) >= 0
      && (sentence.end_ms as number) > (sentence.start_ms as number)
  }

  function reconcileIndicesAfterRemoval(removedIndex: number) {
    const player = usePlayerStore()

    if (player.currentIndex > removedIndex) {
      player.setCurrentIndex(player.currentIndex - 1)
    } else if (player.currentIndex >= draftSentences.value.length) {
      player.setCurrentIndex(Math.max(0, draftSentences.value.length - 1))
    }

    if (editingIndex.value === removedIndex) {
      editingIndex.value = null
    } else if (editingIndex.value !== null && editingIndex.value > removedIndex) {
      editingIndex.value--
    }
  }

  function mergedStartMs(a: Sentence, b: Sentence): number | undefined {
    const values = [a.start_ms, b.start_ms].filter(Number.isFinite) as number[]
    return values.length ? Math.min(...values) : undefined
  }

  function mergedEndMs(a: Sentence, b: Sentence): number | undefined {
    const values = [a.end_ms, b.end_ms].filter(Number.isFinite) as number[]
    return values.length ? Math.max(...values) : undefined
  }

  function enterEditMode() {
    if (sentences.value.length === 0) return

    isEditing.value = true
    resetSentenceIdCounter()
    const player = usePlayerStore()
    editingIndex.value = Math.max(0, Math.min(player.currentIndex, sentences.value.length - 1))
    draftSentences.value = sentences.value.map(cloneSentence)
    if (draftSentences.value[editingIndex.value]) {
      draftSentences.value[editingIndex.value].status = 'editing'
    }
    hasUnsavedChanges.value = false
  }

  function cancelEdits() {
    resetEditingState()
  }

  function saveEdits() {
    sentences.value = draftSentences.value.map(s => ({ ...s, status: 'saved' as const, dirty: false }))
    const player = usePlayerStore()
    player.setCurrentIndex(Math.max(0, Math.min(player.currentIndex, sentences.value.length - 1)))
    resetSentenceIdCounter()
    resetEditingState()
  }

  function startEditing(index: number) {
    if (!isEditing.value) return
    const nextSentence = draftSentences.value[index]
    if (!nextSentence) return

    if (editingIndex.value !== null) {
      const cur = draftSentences.value[editingIndex.value]
      if (cur && cur.status !== 'new') cur.status = cur.dirty ? 'changed' : 'saved'
    }
    editingIndex.value = index
    if (nextSentence.status !== 'new') nextSentence.status = 'editing'
  }

  function finishEditing() {
    if (editingIndex.value === null) return
    const s = draftSentences.value[editingIndex.value]
    if (s && s.status !== 'new') s.status = s.dirty ? 'changed' : 'saved'
    editingIndex.value = null
  }

  function updateDraft(index: number, value: string) {
    const s = draftSentences.value[index]
    if (!s) return
    s.en = value
    markSentenceDirty(s, s.status === 'new' ? 'new' : 'editing')
  }

  function splitSentence(index: number, cursorPosition: number): boolean {
    if (!isEditing.value) return false

    const sentence = draftSentences.value[index]
    if (!sentence) return false

    const source = sentence.en
    const clampedCursor = Math.max(0, Math.min(cursorPosition, source.length))
    const left = source.slice(0, clampedCursor).trim()
    const right = source.slice(clampedCursor).trim()

    if (!left || !right) {
      app.showSubtitleToast('Place the cursor in the middle of a sentence to split it', 'error')
      return false
    }

    const newSentence: Sentence = {
      id: nextSentenceId(),
      en: right,
      status: 'new',
      dirty: true,
      issues: [],
      start_ms: undefined,
      end_ms: undefined,
    }

    if (hasValidTimeRange(sentence) && sentence.end_ms - sentence.start_ms > 1) {
      const duration = sentence.end_ms - sentence.start_ms
      const ratio = source.length > 0 ? clampedCursor / source.length : 0.5
      const splitMs = Math.max(
        sentence.start_ms + 1,
        Math.min(sentence.end_ms - 1, Math.round(sentence.start_ms + duration * ratio)),
      )
      newSentence.start_ms = splitMs
      newSentence.end_ms = sentence.end_ms
      sentence.end_ms = splitMs
    }

    sentence.en = left
    markSentenceDirty(sentence)
    draftSentences.value.splice(index + 1, 0, newSentence)
    hasUnsavedChanges.value = true
    startEditing(index + 1)
    app.showSubtitleToast('Sentence split')
    return true
  }

  function mergeWithPrev(index: number): boolean {
    if (!isEditing.value || index <= 0) return false

    const prev = draftSentences.value[index - 1]
    const current = draftSentences.value[index]
    if (!prev || !current) return false

    prev.en = `${prev.en.trim()} ${current.en.trim()}`.trim()
    prev.start_ms = mergedStartMs(prev, current)
    prev.end_ms = mergedEndMs(prev, current)
    markSentenceDirty(prev)
    draftSentences.value.splice(index, 1)
    reconcileIndicesAfterRemoval(index)
    startEditing(index - 1)
    app.showSubtitleToast('Merged with previous sentence')
    return true
  }

  function mergeWithNext(index: number): boolean {
    if (!isEditing.value || index >= draftSentences.value.length - 1) return false

    const current = draftSentences.value[index]
    const next = draftSentences.value[index + 1]
    if (!current || !next) return false

    current.en = `${current.en.trim()} ${next.en.trim()}`.trim()
    current.start_ms = mergedStartMs(current, next)
    current.end_ms = mergedEndMs(current, next)
    markSentenceDirty(current)
    draftSentences.value.splice(index + 1, 1)
    reconcileIndicesAfterRemoval(index + 1)
    startEditing(index)
    app.showSubtitleToast('Merged with next sentence')
    return true
  }

  async function loadSubtitles(path: string): Promise<void> {
    const entries = await invoke<SubtitleEntry[]>('load_subtitle_file', { path })
    sentences.value = entries.map(e => ({
      id: e.id,
      en: e.en,
      status: 'saved' as const,
      dirty: false,
      issues: [],
      start_ms: e.start_ms,
      end_ms: e.end_ms,
    }))
    resetSentenceIdCounter()
    resetEditingState()
  }

  async function saveSubtitles(path: string): Promise<void> {
    try {
      const entries: SubtitleEntry[] = sentences.value.map(s => ({
        id: s.id,
        en: s.en,
        start_ms: s.start_ms,
        end_ms: s.end_ms,
      }))
      await invoke('save_subtitle_file', { path, entries })
    } catch (error) {
      app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
      throw error
    }
  }

  /** 开始转写音频文件（自动调用） */
  async function startTranscribe(audioPath: string, modelPath?: string): Promise<void> {
    const settings = useSettingsStore()
    const jobId = nextTranscribeJobId++
    console.info('[transcribe] start', { jobId, audioPath })
    currentAudioPath.value = audioPath
    activeTranscribeJobId.value = jobId
    isTranscribing.value = true
    transcribeProgress.value = 0
    transcribeStatus.value = 'Preparing transcription'
    transcribeError.value = null
    sentences.value = []
    resetEditingState()

    try {
      await invoke<number>('transcribe_audio', {
        audioPath,
        modelPath: modelPath ?? null,
        whisperModel: settings.selectedWhisperModel,
        modelDir: settings.modelDirectory || null,
        jobId,
      })
    } catch (err) {
      if (activeTranscribeJobId.value === jobId && currentAudioPath.value === audioPath) {
        const message = String(err)
        transcribeError.value = message
        transcribeStatus.value = 'Transcription failed'
        isTranscribing.value = false
        activeTranscribeJobId.value = null
        app.showSubtitleToast(message, 'error')
      }
    }
  }

  function isCurrentTranscribeTarget(jobId: number, audioPath: string): boolean {
    return activeTranscribeJobId.value === jobId && currentAudioPath.value === audioPath
  }

  function applyTranscribeProgress(event: TranscribeProgressEvent) {
    if (!isCurrentTranscribeTarget(event.job_id, event.audio_path)) return
    transcribeProgress.value = event.percent
    transcribeStatus.value = event.sentence
  }

  function applyTranscribeDone(event: TranscribeDoneEvent) {
    const isCurrent = isCurrentTranscribeTarget(event.job_id, event.audio_path)
    console.info('[transcribe] apply done', {
      jobId: event.job_id,
      audioPath: event.audio_path,
      isCurrent,
      incomingSegments: event.segments.length,
      currentAudioPath: currentAudioPath.value,
      activeTranscribeJobId: activeTranscribeJobId.value,
    })
    if (!isCurrent) return

    sentences.value = event.segments.map((seg, idx) => ({
      id: seg.id ?? idx + 1,
      en: seg.en,
      status: 'saved' as const,
      dirty: false,
      issues: [],
      start_ms: seg.start_ms,
      end_ms: seg.end_ms,
    }))
    console.info('[transcribe] sentences updated', {
      sentences: sentences.value.length,
      firstSentence: sentences.value[0]?.en ?? null,
    })
    sentenceIdCounter.value = sentences.value.length + 1
    resetSentenceIdCounter()
    isTranscribing.value = false
    transcribeProgress.value = 100
    transcribeStatus.value = 'Subtitles ready'
    activeTranscribeJobId.value = null
  }

  function applyTranscribeError(event: TranscribeErrorEvent) {
    if (!isCurrentTranscribeTarget(event.job_id, event.audio_path)) return

    transcribeError.value = event.error
    transcribeStatus.value = 'Transcription failed'
    isTranscribing.value = false
    activeTranscribeJobId.value = null
    app.showSubtitleToast(event.error, 'error')
  }

  return {
    sentences, isEditing, editingIndex, draftSentences, hasUnsavedChanges,
    isTranscribing, transcribeProgress, transcribeStatus, transcribeError,
    sentenceIdCounter, currentAudioPath, activeTranscribeJobId, displaySentences,
    cloneSentence, enterEditMode, cancelEdits, saveEdits,
    startEditing, finishEditing, updateDraft, splitSentence, mergeWithPrev, mergeWithNext,
    loadSubtitles, saveSubtitles, startTranscribe,
    isCurrentTranscribeTarget, applyTranscribeProgress, applyTranscribeDone, applyTranscribeError,
  }
})

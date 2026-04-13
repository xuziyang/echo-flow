// src/stores/useTranscriptStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'

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

  function enterEditMode() {
    if (sentences.value.length === 0) return

    isEditing.value = true
    editingIndex.value = 0
    draftSentences.value = sentences.value.map(cloneSentence)
    if (draftSentences.value[0]) {
      draftSentences.value[0].status = 'editing'
    }
    hasUnsavedChanges.value = false
  }

  function cancelEdits() {
    resetEditingState()
  }

  function saveEdits() {
    sentences.value = draftSentences.value.map(s => ({ ...s, status: 'saved' as const, dirty: false }))
    resetEditingState()
  }

  function startEditing(index: number) {
    if (!isEditing.value) return
    const nextSentence = draftSentences.value[index]
    if (!nextSentence) return

    if (editingIndex.value !== null) {
      const cur = draftSentences.value[editingIndex.value]
      if (cur) cur.status = cur.dirty ? 'changed' : 'saved'
    }
    editingIndex.value = index
    nextSentence.status = 'editing'
  }

  function finishEditing() {
    if (editingIndex.value === null) return
    const s = draftSentences.value[editingIndex.value]
    if (s) s.status = s.dirty ? 'changed' : 'saved'
    editingIndex.value = null
  }

  function updateDraft(index: number, value: string) {
    const s = draftSentences.value[index]
    if (!s) return
    s.en = value
    s.dirty = true
    hasUnsavedChanges.value = true
    s.status = 'editing'
  }

  async function loadSubtitles(path: string): Promise<void> {
    const entries = await invoke<SubtitleEntry[]>('load_subtitle_file', { path })
    sentenceIdCounter.value = entries.length + 1
    sentences.value = entries.map(e => ({
      id: e.id,
      en: e.en,
      status: 'saved' as const,
      dirty: false,
      issues: [],
      start_ms: e.start_ms,
      end_ms: e.end_ms,
    }))
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
    const jobId = nextTranscribeJobId++
    console.info('[transcribe] start', { jobId, audioPath })
    currentAudioPath.value = audioPath
    activeTranscribeJobId.value = jobId
    isTranscribing.value = true
    transcribeProgress.value = 0
    transcribeError.value = null
    sentences.value = []
    resetEditingState()

    try {
      await invoke<number>('transcribe_audio', {
        audioPath,
        modelPath: modelPath ?? null,
        jobId,
      })
    } catch (err) {
      if (activeTranscribeJobId.value === jobId && currentAudioPath.value === audioPath) {
        transcribeError.value = String(err)
        isTranscribing.value = false
        activeTranscribeJobId.value = null
      }
    }
  }

  function isCurrentTranscribeTarget(jobId: number, audioPath: string): boolean {
    return activeTranscribeJobId.value === jobId && currentAudioPath.value === audioPath
  }

  function applyTranscribeProgress(event: TranscribeProgressEvent) {
    if (!isCurrentTranscribeTarget(event.job_id, event.audio_path)) return
    transcribeProgress.value = event.percent
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
    isTranscribing.value = false
    transcribeProgress.value = 100
    activeTranscribeJobId.value = null
  }

  function applyTranscribeError(event: TranscribeErrorEvent) {
    if (!isCurrentTranscribeTarget(event.job_id, event.audio_path)) return

    transcribeError.value = event.error
    isTranscribing.value = false
    activeTranscribeJobId.value = null
  }

  return {
    sentences, isEditing, editingIndex, draftSentences, hasUnsavedChanges,
    isTranscribing, transcribeProgress, transcribeError,
    sentenceIdCounter, currentAudioPath, activeTranscribeJobId, displaySentences,
    cloneSentence, enterEditMode, cancelEdits, saveEdits,
    startEditing, finishEditing, updateDraft,
    loadSubtitles, saveSubtitles, startTranscribe,
    isCurrentTranscribeTarget, applyTranscribeProgress, applyTranscribeDone, applyTranscribeError,
  }
})

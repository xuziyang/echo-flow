// src/stores/useTranscriptStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface Sentence {
  id: number
  en: string
  zh: string
  status: 'saved' | 'new' | 'changed' | 'editing'
  dirty: boolean
  issues: string[]
  start_ms?: number
  end_ms?: number
}

export interface SubtitleEntry {
  id: number
  en: string
  zh: string
}

export interface TranscriptSegment {
  id: number
  en: string
  zh: string
  start_ms: number
  end_ms: number
}

export interface TranscribeProgress {
  percent: number
  sentence: string
  done: boolean
}

export const useTranscriptStore = defineStore('transcript', () => {
  const sentences = ref<Sentence[]>([])
  const isEditing = ref(false)
  const editingIndex = ref<number | null>(null)
  const draftSentences = ref<Sentence[]>([])
  const hasUnsavedChanges = ref(false)
  const isTranscribing = ref(false)
  const transcribeProgress = ref(0)
  const transcribeError = ref<string | null>(null)
  const sentenceIdCounter = ref(1)

  const displaySentences = computed(() => isEditing.value ? draftSentences.value : sentences.value)

  function cloneSentence(s: Sentence): Sentence {
    return { ...s, issues: [...s.issues] }
  }

  function enterEditMode() {
    isEditing.value = true
    editingIndex.value = 0
    draftSentences.value = sentences.value.map(cloneSentence)
    draftSentences.value[0].status = 'editing'
    hasUnsavedChanges.value = false
  }

  function cancelEdits() {
    isEditing.value = false
    editingIndex.value = null
    draftSentences.value = []
    hasUnsavedChanges.value = false
  }

  function saveEdits() {
    sentences.value = draftSentences.value.map(s => ({ ...s, status: 'saved' as const, dirty: false }))
    isEditing.value = false
    editingIndex.value = null
    draftSentences.value = []
    hasUnsavedChanges.value = false
  }

  function startEditing(index: number) {
    if (editingIndex.value !== null) {
      const cur = draftSentences.value[editingIndex.value]
      if (cur) cur.status = cur.dirty ? 'changed' : 'saved'
    }
    editingIndex.value = index
    draftSentences.value[index].status = 'editing'
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
    s.issues = s.issues.filter(i => i !== '已拆分，建议检查中文')
    hasUnsavedChanges.value = true
    s.status = 'editing'
  }

  async function loadSubtitles(path: string): Promise<void> {
    const entries = await invoke<SubtitleEntry[]>('load_subtitle_file', { path })
    sentenceIdCounter.value = entries.length + 1
    sentences.value = entries.map(e => ({
      id: e.id,
      en: e.en,
      zh: e.zh,
      status: 'saved' as const,
      dirty: false,
      issues: [],
    }))
    isEditing.value = false
    editingIndex.value = null
    draftSentences.value = []
    hasUnsavedChanges.value = false
  }

  async function saveSubtitles(path: string): Promise<void> {
    const entries: SubtitleEntry[] = sentences.value.map(s => ({
      id: s.id,
      en: s.en,
      zh: s.zh,
    }))
    await invoke('save_subtitle_file', { path, entries })
  }

  /** 开始转写音频文件（自动调用） */
  async function startTranscribe(audioPath: string, modelPath?: string): Promise<void> {
    if (isTranscribing.value) return
    isTranscribing.value = true
    transcribeProgress.value = 0
    transcribeError.value = null

    try {
      await invoke('transcribe_audio', {
        audioPath,
        modelPath: modelPath ?? null,
      })
    } catch (err) {
      transcribeError.value = String(err)
      isTranscribing.value = false
    }
  }

  /** 设置转写事件监听（初始化一次） */
  function initTranscribeListeners() {
    listen<TranscribeProgress>('transcribe-progress', (event) => {
      transcribeProgress.value = event.payload.percent
    })

    listen<TranscriptSegment[]>('transcribe-done', (event) => {
      sentences.value = event.payload.map((seg, idx) => ({
        id: seg.id ?? idx + 1,
        en: seg.en,
        zh: seg.zh,
        status: 'saved' as const,
        dirty: false,
        issues: [],
        start_ms: seg.start_ms,
        end_ms: seg.end_ms,
      }))
      sentenceIdCounter.value = sentences.value.length + 1
      isTranscribing.value = false
      transcribeProgress.value = 100
    })

    listen<string>('transcribe-error', (event) => {
      transcribeError.value = event.payload
      isTranscribing.value = false
    })
  }

  return {
    sentences, isEditing, editingIndex, draftSentences, hasUnsavedChanges,
    isTranscribing, transcribeProgress, transcribeError,
    sentenceIdCounter, displaySentences,
    cloneSentence, enterEditMode, cancelEdits, saveEdits,
    startEditing, finishEditing, updateDraft,
    loadSubtitles, saveSubtitles, startTranscribe, initTranscribeListeners,
  }
})

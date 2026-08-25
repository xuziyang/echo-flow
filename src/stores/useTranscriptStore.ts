// src/stores/useTranscriptStore.ts
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'
import { usePlayerStore } from './usePlayerStore'
import { useSettingsStore, type WhisperModelType } from './useSettingsStore'
import { useModelDownloadStore } from './useModelDownloadStore'
import { isMissingModelError, toErrorMessage } from '../utils/errors'
import { isWordChar } from '../utils/text'

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

export interface AlignedRange {
  start_ms: number
  end_ms: number
}

export interface SplitAlignmentResult {
  left: AlignedRange
  right: AlignedRange
}

export interface RegenerateTextBound {
  id: number
  start_ms: number
  end_ms: number
  text: string
}

export interface RegenerateTextUpdate {
  id: number
  text: string
}

export interface RegenerateTextsDoneEvent {
  job_id: number
  audio_path: string
  updates: RegenerateTextUpdate[]
}

interface SplitAlignmentOptions {
  leftId: number
  rightId: number
  originalStartMs: number
  originalEndMs: number
  leftText: string
  rightText: string
}

interface ApplicableSplitAlignment {
  left: Sentence
  right: Sentence
}

interface StartTranscribeOptions {
  forceRegenerate?: boolean
  preserveExisting?: boolean
  whisperModel?: WhisperModelType
}

export const useTranscriptStore = defineStore('transcript', () => {
  const app = useAppStore()
  const modelDownload = useModelDownloadStore()
  const sentences = ref<Sentence[]>([])
  const isEditing = ref(false)
  const editingIndex = ref<number | null>(null)
  const draftSentences = ref<Sentence[]>([])
  const hasUnsavedChanges = ref(false)
  const isTranscribing = ref(false)
  const transcribeProgress = ref(0)
  const transcribeStatus = ref('')
  const transcribeError = ref<string | null>(null)
  const needsModelSetup = ref(false)
  const sentenceIdCounter = ref(1)
  const currentAudioPath = ref('')
  const activeTranscribeJobId = ref<number | null>(null)
  const pendingSplitAlignments = ref(new Map<number, number>())
  const currentModelPath = ref<string | null>(null)
  const currentWhisperModel = ref<string | null>(null)
  const currentModelDir = ref<string | null>(null)

  let nextTranscribeJobId = 1
  let nextSplitAlignmentRequestId = 1
  let autoStartFromSetup = false

  const displaySentences = computed(() => isEditing.value ? draftSentences.value : sentences.value)

  function resetEditingState() {
    invalidateAllSplitAlignments()
    isEditing.value = false
    editingIndex.value = null
    draftSentences.value = []
    hasUnsavedChanges.value = false
  }

  function cloneSentence(s: Sentence): Sentence {
    return { ...s, issues: [...s.issues] }
  }

  function cacheEntriesFromSentences(source: Sentence[]): SubtitleEntry[] {
    return source.map(sentence => ({
      id: sentence.id,
      en: sentence.en,
      start_ms: sentence.start_ms,
      end_ms: sentence.end_ms,
    }))
  }

  async function persistCurrentCache(source: Sentence[] = sentences.value): Promise<boolean> {
    if (!currentAudioPath.value || source.length === 0) return false

    const settings = useSettingsStore()
    try {
      await invoke('save_transcription_cache_subtitles', {
        audioPath: currentAudioPath.value,
        entries: cacheEntriesFromSentences(source),
        modelPath: currentModelPath.value,
        whisperModel: currentWhisperModel.value ?? settings.selectedWhisperModel,
        modelDir: (currentModelDir.value ?? settings.modelDirectory) || null,
      })
      return true
    } catch (error) {
      app.showSubtitleToast(
        `Failed to update cached subtitles: ${toErrorMessage(error)}`,
        'error',
      )
      return false
    }
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

  function setSentenceAligning(sentenceId: number, requestId: number) {
    pendingSplitAlignments.value = new Map(pendingSplitAlignments.value).set(sentenceId, requestId)
  }

  function clearSentenceAlignment(sentenceId: number, requestId?: number) {
    if (requestId !== undefined && pendingSplitAlignments.value.get(sentenceId) !== requestId) return

    const next = new Map(pendingSplitAlignments.value)
    next.delete(sentenceId)
    pendingSplitAlignments.value = next
  }

  function invalidateAllSplitAlignments() {
    pendingSplitAlignments.value = new Map()
  }

  function isSentenceAligning(sentenceId: number): boolean {
    return pendingSplitAlignments.value.has(sentenceId)
  }

  function hasValidTimeRange(sentence: Sentence): sentence is Sentence & { start_ms: number; end_ms: number } {
    return Number.isFinite(sentence.start_ms)
      && Number.isFinite(sentence.end_ms)
      && (sentence.start_ms as number) >= 0
      && (sentence.end_ms as number) > (sentence.start_ms as number)
  }

  function isInsideWord(source: string, cursorPosition: number): boolean {
    if (cursorPosition <= 0 || cursorPosition >= source.length) return false
    return isWordChar(source[cursorPosition - 1]) && isWordChar(source[cursorPosition])
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

  function enterEditMode(index?: number) {
    if (sentences.value.length === 0) return

    isEditing.value = true
    resetSentenceIdCounter()
    const player = usePlayerStore()
    const targetIndex = index ?? player.currentIndex
    editingIndex.value = Math.max(0, Math.min(targetIndex, sentences.value.length - 1))
    draftSentences.value = sentences.value.map(cloneSentence)
    if (draftSentences.value[editingIndex.value]) {
      draftSentences.value[editingIndex.value].status = 'editing'
    }
    hasUnsavedChanges.value = false
  }

  function cancelEdits() {
    resetEditingState()
  }

  async function saveEdits(): Promise<void> {
    sentences.value = draftSentences.value.map(s => ({ ...s, status: 'saved' as const, dirty: false }))
    const player = usePlayerStore()
    player.setCurrentIndex(Math.max(0, Math.min(player.currentIndex, sentences.value.length - 1)))
    resetSentenceIdCounter()
    await persistCurrentCache(sentences.value)
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
    clearSentenceAlignment(s.id)
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
    const originalStartMs = sentence.start_ms
    const originalEndMs = sentence.end_ms

    if (!left || !right) {
      app.showSubtitleToast('Place the cursor in the middle of a sentence to split it', 'error')
      return false
    }
    if (isInsideWord(source, clampedCursor)) {
      app.showSubtitleToast('Split at a word boundary, not inside a word', 'error')
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
    if (
      currentAudioPath.value
      && Number.isFinite(originalStartMs)
      && Number.isFinite(originalEndMs)
      && (originalEndMs as number) > (originalStartMs as number) + 1
    ) {
      void alignSplitSentence({
        leftId: sentence.id,
        rightId: newSentence.id,
        originalStartMs: originalStartMs as number,
        originalEndMs: originalEndMs as number,
        leftText: left,
        rightText: right,
      })
    }
    return true
  }

  function findApplicableSplitAlignment(
    options: SplitAlignmentOptions,
    requestId: number,
    result: SplitAlignmentResult,
  ): ApplicableSplitAlignment | null {
    const leftIndex = draftSentences.value.findIndex(sentence => sentence.id === options.leftId)
    const rightIndex = draftSentences.value.findIndex(sentence => sentence.id === options.rightId)
    const left = draftSentences.value[leftIndex]
    const right = draftSentences.value[rightIndex]
    const isCurrentRequest = pendingSplitAlignments.value.get(options.leftId) === requestId
      && pendingSplitAlignments.value.get(options.rightId) === requestId

    if (
      !isEditing.value
      || !isCurrentRequest
      || !left
      || !right
      || rightIndex !== leftIndex + 1
      || left.en !== options.leftText
      || right.en !== options.rightText
      || result.left.end_ms <= result.left.start_ms
      || result.right.end_ms <= result.right.start_ms
      || result.left.end_ms > result.right.start_ms
    ) {
      return null
    }

    return { left, right }
  }

  async function alignSplitSentence(options: SplitAlignmentOptions): Promise<boolean> {
    if (!currentAudioPath.value) return false

    const settings = useSettingsStore()
    const requestId = nextSplitAlignmentRequestId++
    setSentenceAligning(options.leftId, requestId)
    setSentenceAligning(options.rightId, requestId)

    try {
      const result = await invoke<SplitAlignmentResult>('align_split_sentence', {
        audioPath: currentAudioPath.value,
        startMs: options.originalStartMs,
        endMs: options.originalEndMs,
        leftText: options.leftText,
        rightText: options.rightText,
        modelDir: settings.modelDirectory || null,
      })
      const splitAlignment = findApplicableSplitAlignment(options, requestId, result)
      if (!splitAlignment) return false

      splitAlignment.left.start_ms = result.left.start_ms
      splitAlignment.left.end_ms = result.left.end_ms
      splitAlignment.right.start_ms = result.right.start_ms
      splitAlignment.right.end_ms = result.right.end_ms
      hasUnsavedChanges.value = true
      void persistCurrentCache(draftSentences.value)
      return true
    } catch (error) {
      if (
        pendingSplitAlignments.value.get(options.leftId) === requestId
        || pendingSplitAlignments.value.get(options.rightId) === requestId
      ) {
        app.showSubtitleToast(
          `Split alignment failed; kept estimated timing: ${toErrorMessage(error)}`,
          'error',
        )
      }
      return false
    } finally {
      clearSentenceAlignment(options.leftId, requestId)
      clearSentenceAlignment(options.rightId, requestId)
    }
  }

  /** 合并两句：source 并入 target，删除 source 并修正索引 */
  function mergeSentences(targetIndex: number, sourceIndex: number): boolean {
    const target = draftSentences.value[targetIndex]
    const source = draftSentences.value[sourceIndex]
    if (!target || !source) return false

    invalidateAllSplitAlignments()
    target.en = `${target.en.trim()} ${source.en.trim()}`.trim()
    target.start_ms = mergedStartMs(target, source)
    target.end_ms = mergedEndMs(target, source)
    markSentenceDirty(target)
    draftSentences.value.splice(sourceIndex, 1)
    reconcileIndicesAfterRemoval(sourceIndex)
    startEditing(targetIndex)
    return true
  }

  function mergeWithPrev(index: number): boolean {
    if (!isEditing.value || index <= 0) return false
    if (!mergeSentences(index - 1, index)) return false
    app.showSubtitleToast('Merged with previous sentence')
    return true
  }

  function mergeWithNext(index: number): boolean {
    if (!isEditing.value || index >= draftSentences.value.length - 1) return false
    if (!mergeSentences(index, index + 1)) return false
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
      app.showSubtitleToast(toErrorMessage(error), 'error')
      throw error
    }
  }

  /** 转写任务通用初始化：分配 jobId 并置位进度状态 */
  function beginTranscribeJob(status: string, whisperModel: WhisperModelType): number {
    const settings = useSettingsStore()
    const jobId = nextTranscribeJobId++
    currentWhisperModel.value = whisperModel
    currentModelDir.value = settings.modelDirectory || null
    activeTranscribeJobId.value = jobId
    isTranscribing.value = true
    transcribeProgress.value = 0
    transcribeStatus.value = status
    transcribeError.value = null
    needsModelSetup.value = false
    return jobId
  }

  function enterModelSetup() {
    needsModelSetup.value = true
    transcribeError.value = null
    transcribeStatus.value = ''
    isTranscribing.value = false
    activeTranscribeJobId.value = null
  }

  /** 转写启动失败：仅当任务仍是当前任务时更新状态并提示 */
  function failTranscribeStart(jobId: number, audioPath: string, error: unknown) {
    if (!isCurrentTranscribeTarget(jobId, audioPath)) return
    if (isMissingModelError(error)) {
      enterModelSetup()
      return
    }
    const message = toErrorMessage(error)
    transcribeError.value = message
    transcribeStatus.value = 'Transcription failed'
    isTranscribing.value = false
    activeTranscribeJobId.value = null
    app.showSubtitleToast(message, 'error')
  }

  /** 开始转写音频文件（自动调用） */
  async function startTranscribe(
    audioPath: string,
    modelPath?: string,
    options: StartTranscribeOptions = {},
  ): Promise<void> {
    const settings = useSettingsStore()
    currentAudioPath.value = audioPath
    currentModelPath.value = modelPath ?? null
    if (!options.preserveExisting) {
      sentences.value = []
    }
    resetEditingState()

    try {
      await modelDownload.checkModels()
    } catch (error) {
      console.warn('Failed to refresh model list before transcription:', error)
    }

    if (!modelDownload.areRequiredModelsInstalled) {
      enterModelSetup()
      return
    }

    needsModelSetup.value = false
    const whisperModel = options.whisperModel ?? settings.selectedWhisperModel
    const jobId = beginTranscribeJob('Preparing transcription', whisperModel)
    console.info('[transcribe] start', { jobId, audioPath })

    try {
      await invoke<number>('transcribe_audio', {
        audioPath,
        modelPath: modelPath ?? null,
        whisperModel,
        modelDir: settings.modelDirectory || null,
        jobId,
        forceRegenerate: options.forceRegenerate ?? false,
      })
    } catch (err) {
      failTranscribeStart(jobId, audioPath, err)
    }
  }

  async function regenerateSubtitles(whisperModel?: WhisperModelType): Promise<void> {
    if (isTranscribing.value) return

    const audioPath = currentAudioPath.value
    if (!audioPath) {
      app.showSubtitleToast('Load an audio file before regenerating subtitles', 'error')
      return
    }

    resetEditingState()
    const { useRecordingStore } = await import('./useRecordingStore')
    const recording = useRecordingStore()
    const recordingsCleared = await recording.clearRecordingsForAudio(audioPath)
    if (!recordingsCleared) return

    await startTranscribe(audioPath, currentModelPath.value ?? undefined, {
      forceRegenerate: true,
      preserveExisting: true,
      whisperModel,
    })
  }

  /**
   * 重新识别文本：保留时间边界和录音，只重新生成每句文本。
   * 跑完整 Whisper（保留上下文）+ Wav2Vec2 对齐，再用旧边界从对齐结果里切出新文本。
   */
  async function regenerateSubtitleTexts(whisperModel?: WhisperModelType): Promise<void> {
    if (isTranscribing.value) return

    const audioPath = currentAudioPath.value
    if (!audioPath) {
      app.showSubtitleToast('Load an audio file before regenerating subtitle texts', 'error')
      return
    }

    const bounds: RegenerateTextBound[] = sentences.value
      .filter(s => Number.isFinite(s.start_ms) && Number.isFinite(s.end_ms)
        && (s.end_ms as number) > (s.start_ms as number))
      .map(s => ({
        id: s.id,
        start_ms: s.start_ms as number,
        end_ms: s.end_ms as number,
        text: s.en,
      }))

    if (bounds.length === 0) {
      app.showSubtitleToast('No timed sentences to regenerate', 'error')
      return
    }

    resetEditingState()

    const settings = useSettingsStore()
    const selectedWhisperModel = whisperModel ?? settings.selectedWhisperModel
    const jobId = beginTranscribeJob('Regenerating subtitle texts', selectedWhisperModel)
    console.info('[transcribe] regenerate texts', { jobId, audioPath, bounds: bounds.length })

    try {
      await invoke<number>('regenerate_subtitle_texts', {
        audioPath,
        bounds,
        modelPath: currentModelPath.value ?? null,
        whisperModel: selectedWhisperModel,
        modelDir: settings.modelDirectory || null,
        jobId,
      })
    } catch (err) {
      failTranscribeStart(jobId, audioPath, err)
    }
  }

  function applyRegenerateTextsDone(event: RegenerateTextsDoneEvent) {
    const isCurrent = isCurrentTranscribeTarget(event.job_id, event.audio_path)
    console.info('[transcribe] apply texts done', {
      jobId: event.job_id,
      audioPath: event.audio_path,
      isCurrent,
      updates: event.updates.length,
    })
    if (!isCurrent) return

    const updatesById = new Map(event.updates.map(u => [u.id, u.text]))
    let changedCount = 0
    for (const sentence of sentences.value) {
      const newText = updatesById.get(sentence.id)
      if (newText !== undefined && newText !== sentence.en) {
        sentence.en = newText
        sentence.dirty = false
        sentence.status = 'saved'
        changedCount++
      }
    }

    isTranscribing.value = false
    transcribeProgress.value = 100
    transcribeStatus.value = 'Subtitles ready'
    activeTranscribeJobId.value = null

    void persistCurrentCache(sentences.value)
    if (changedCount > 0) {
      app.showSubtitleToast(`重新识别了 ${changedCount} 句文本，录音已保留`)
    } else {
      app.showSubtitleToast('文本无变化，录音已保留')
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
    if (isMissingModelError(event.error)) {
      enterModelSetup()
      return
    }

    transcribeError.value = event.error
    transcribeStatus.value = 'Transcription failed'
    isTranscribing.value = false
    activeTranscribeJobId.value = null
    app.showSubtitleToast(event.error, 'error')
  }

  watch(
    () => modelDownload.areRequiredModelsInstalled,
    (ready) => {
      if (!ready || !needsModelSetup.value) return
      if (sentences.value.length > 0) {
        needsModelSetup.value = false
        return
      }
      if (!currentAudioPath.value || isTranscribing.value || autoStartFromSetup) return
      autoStartFromSetup = true
      void startTranscribe(currentAudioPath.value, currentModelPath.value ?? undefined)
        .finally(() => {
          autoStartFromSetup = false
        })
    },
  )

  return {
    sentences, isEditing, editingIndex, draftSentences, hasUnsavedChanges,
    isTranscribing, transcribeProgress, transcribeStatus, transcribeError, needsModelSetup,
    sentenceIdCounter, currentAudioPath, activeTranscribeJobId, displaySentences,
    cloneSentence, enterEditMode, cancelEdits, saveEdits,
    startEditing, finishEditing, updateDraft, splitSentence, alignSplitSentence,
    mergeWithPrev, mergeWithNext, isSentenceAligning,
    loadSubtitles, saveSubtitles, startTranscribe, regenerateSubtitles, regenerateSubtitleTexts,
    isCurrentTranscribeTarget, applyTranscribeProgress, applyTranscribeDone, applyRegenerateTextsDone, applyTranscribeError,
  }
})

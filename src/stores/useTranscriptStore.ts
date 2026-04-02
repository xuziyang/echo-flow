// src/stores/useTranscriptStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Sentence {
  id: number
  en: string
  zh: string
  status: 'saved' | 'new' | 'changed' | 'editing'
  dirty: boolean
  issues: string[]
}

export const useTranscriptStore = defineStore('transcript', () => {
  const sentences = ref<Sentence[]>([
    { id: 1, en: "Hey, how's it going?", zh: "嘿，最近怎么样？", status: 'saved', dirty: false, issues: [] },
    { id: 2, en: "Not bad, thanks for asking. How about you?", zh: "不错，谢谢关心。你呢？", status: 'saved', dirty: false, issues: [] },
    { id: 3, en: "I'm doing great! The weather is beautiful today, isn't it?", zh: "我很好！今天天气真好，不是吗？", status: 'saved', dirty: false, issues: [] },
    { id: 4, en: "It really is. Makes me want to go for a walk in the park.", zh: "确实是。让我想去公园散散步。", status: 'saved', dirty: false, issues: [] },
    { id: 5, en: "That sounds like a wonderful idea. Enjoy your day!", zh: "听起来是个好主意。祝你今天愉快！", status: 'saved', dirty: false, issues: [] },
    { id: 6, en: "You too, take care!", zh: "你也是，保重！", status: 'saved', dirty: false, issues: [] },
  ])
  const isEditing = ref(false)
  const editingIndex = ref<number | null>(null)
  const draftSentences = ref<Sentence[]>([])
  const hasUnsavedChanges = ref(false)
  const sentenceIdCounter = ref(7) // TODO: wire to splitSentence/removeSentence when editing flow is complete

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

  return { sentences, isEditing, editingIndex, draftSentences, hasUnsavedChanges,
           sentenceIdCounter, displaySentences, cloneSentence, enterEditMode,
           cancelEdits, saveEdits, startEditing, finishEditing, updateDraft }
})

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import { useTextMask } from '../../composables/useTextMask'
import MaskableText from '../common/MaskableText.vue'
import Icon from '../Icon.vue'

const props = defineProps<{ item: Sentence; index: number; disabled?: boolean }>()
const emit = defineEmits<{ click: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const transcript = useTranscriptStore()
const { maskText } = useTextMask()

const editor = ref<HTMLTextAreaElement | null>(null)
const cursorPos = ref(0)

const isActive = computed(() => (
  transcript.isEditing
    ? props.index === transcript.editingIndex
    : props.index === player.currentIndex
))
const isRowDisabled = computed(() => Boolean(props.disabled) && !transcript.isEditing)
const isEditingThis = computed(() => transcript.isEditing && props.index === transcript.editingIndex)
const canMergePrev = computed(() => transcript.isEditing && props.index > 0)
const canMergeNext = computed(() => (
  transcript.isEditing && props.index < transcript.draftSentences.length - 1
))
const isAligning = computed(() => transcript.isSentenceAligning(props.item.id))
const hasTiming = computed(() => (
  Number.isFinite(props.item.start_ms)
  && Number.isFinite(props.item.end_ms)
  && (props.item.end_ms as number) > (props.item.start_ms as number)
))
const hasRecording = computed(() => recording.hasRecordingForSentence(props.index))
const masked = computed(() => maskText.value && app.mode === 'listening' && !transcript.isEditing)

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9']/.test(char))
}

/** 拆句光标校验：不能在词中间或首尾 */
const splitCursorInvalid = computed(() => {
  const value = editor.value?.value ?? props.item.en
  const pos = cursorPos.value
  if (pos <= 0 || pos >= value.length) return true
  return isWordChar(value[pos - 1]) && isWordChar(value[pos])
})
const showSplitHint = computed(() => {
  const value = editor.value?.value ?? props.item.en
  return splitCursorInvalid.value && cursorPos.value > 0 && cursorPos.value < value.length
})

function syncCursor() {
  cursorPos.value = editor.value?.selectionStart ?? 0
}

function focusEditor() {
  nextTick(() => {
    if (!editor.value) return
    editor.value.focus()
    const length = editor.value.value.length
    editor.value.setSelectionRange(length, length)
    syncCursor()
  })
}

function onRowClick() {
  if (isRowDisabled.value) return
  emit('click', props.index)
}

function onStartEdit() {
  if (isRowDisabled.value || transcript.isEditing) return
  transcript.enterEditMode(props.index)
}

function onInput(event: Event) {
  transcript.updateDraft(props.index, (event.target as HTMLTextAreaElement).value)
  syncCursor()
}

function splitAtCursor() {
  syncCursor()
  if (splitCursorInvalid.value) return
  transcript.splitSentence(props.index, cursorPos.value)
}

function onEditorKeydown(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key === 'Enter') {
    event.preventDefault()
    splitAtCursor()
  } else if (event.key === 'Escape') {
    transcript.finishEditing()
  }
}

watch(() => isEditingThis.value, (editing) => {
  if (editing) focusEditor()
}, { immediate: true })
</script>

<template>
  <div
    class="sub-item"
    :class="{ current: isActive && !transcript.isEditing, disabled: isRowDisabled, 'sub-edit': transcript.isEditing }"
    @click="onRowClick"
    @dblclick="onStartEdit"
  >
    <span class="num">{{ index + 1 }}</span>

    <div class="body">
      <template v-if="!transcript.isEditing">
        <span class="txt"><MaskableText :text="item.en" :masked="masked" /></span>
        <span v-if="isAligning || !hasTiming || item.status === 'new' || item.status === 'changed'" class="badges">
          <span v-if="item.status === 'new'" class="badge b-new">新建</span>
          <span v-else-if="item.status === 'changed'" class="badge b-edited">已改</span>
          <span v-if="isAligning" class="badge b-align">◌ 对齐中</span>
          <span v-else-if="!hasTiming" class="badge b-est">≈ 估算时间</span>
        </span>
      </template>

      <template v-else>
        <textarea
          v-if="isEditingThis"
          ref="editor"
          :value="item.en"
          rows="2"
          @click.stop
          @input="onInput"
          @keyup="syncCursor"
          @keydown="onEditorKeydown"
        />
        <p v-else class="txt" style="user-select: none">{{ item.en }}</p>

        <template v-if="isEditingThis">
          <div class="row" @click.stop>
            <button class="btn" :disabled="splitCursorInvalid" @click="splitAtCursor">
              ⤶ 在光标处拆句 <kbd>Enter</kbd>
            </button>
            <button class="btn" :disabled="!canMergePrev" @click="transcript.mergeWithPrev(index)">⇈ 并入上句</button>
            <button class="btn" :disabled="!canMergeNext" @click="transcript.mergeWithNext(index)">⇊ 并入下句</button>
          </div>
          <div v-if="showSplitHint" class="split-hint">请把光标移到单词之间（不能切在单词中间）</div>
          <div class="row" style="justify-content: flex-end" @click.stop>
            <span v-if="isAligning || item.status !== 'saved'" class="badges" style="margin: auto auto auto 0">
              <span v-if="isAligning" class="badge b-align">◌ 对齐中</span>
              <span v-else-if="item.status === 'new'" class="badge b-new">新建</span>
              <span v-else-if="item.status !== 'saved'" class="badge b-edited">已改</span>
            </span>
            <button class="btn" @click="transcript.cancelEdits()">取消</button>
            <button class="btn btn-primary" @click="transcript.saveEdits()">保存</button>
          </div>
        </template>
      </template>
    </div>

    <span v-if="!transcript.isEditing && hasRecording" class="rec-dot" data-tip="本句已有录音"></span>
    <button
      v-if="!transcript.isEditing"
      class="edit-btn"
      data-tip="编辑字幕"
      @click.stop="onStartEdit"
    >
      <Icon name="pen" :size="13" :stroke-width="1.8" />
    </button>
  </div>
</template>

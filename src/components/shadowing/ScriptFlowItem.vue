<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import Icon from '../Icon.vue'

const props = defineProps<{ item: Sentence; index: number; disabled?: boolean }>()
const emit = defineEmits<{ click: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
const editor = ref<HTMLTextAreaElement | null>(null)
const isActive = computed(() => (
  transcript.isEditing
    ? props.index === transcript.editingIndex
    : props.index === player.currentIndex
))
const isRowDisabled = computed(() => props.disabled && !transcript.isEditing)
const canMergePrev = computed(() => transcript.isEditing && props.index > 0)
const canMergeNext = computed(() => (
  transcript.isEditing && props.index < transcript.draftSentences.length - 1
))
const itemClass = computed(() => {
  if (isActive.value) {
    return app.theme === 'dark'
      ? 'bg-brand-900/20 border-brand-500/30 opacity-100 shadow-md shadow-brand-500/10'
      : 'bg-gray-100 border-transparent opacity-100 shadow-sm shadow-black/5'
  }

  return app.theme === 'dark'
    ? `bg-transparent border-transparent opacity-50 shadow-none ${isRowDisabled.value ? 'cursor-not-allowed' : 'hover:opacity-85 hover:bg-white/5'}`
    : `bg-transparent border-transparent opacity-50 shadow-none ${isRowDisabled.value ? 'cursor-not-allowed' : 'hover:opacity-100 hover:bg-gray-200'}`
})

function focusEditor() {
  nextTick(() => {
    if (!editor.value) return
    editor.value.focus()
    const length = editor.value.value.length
    editor.value.setSelectionRange(length, length)
  })
}

function onRowClick() {
  if (isRowDisabled.value) return
  emit('click', props.index)
}

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  transcript.updateDraft(props.index, target.value)
}

function splitAtCursor() {
  const cursor = editor.value?.selectionStart ?? props.item.en.length
  transcript.splitSentence(props.index, cursor)
}

watch(() => [transcript.isEditing, transcript.editingIndex] as const, ([isEditing, editingIndex]) => {
  if (isEditing && editingIndex === props.index) {
    focusEditor()
  }
}, { immediate: true })
</script>

<template>
  <div @click="onRowClick"

       class="p-2.5 rounded-lg border transition-colors duration-150 group flex gap-2 items-start"
       :class="[itemClass, isRowDisabled ? 'cursor-not-allowed' : 'cursor-pointer']"
       >

    <div
      class="flex h-[1.25rem] min-w-6 items-center justify-center px-1 text-[10px] font-medium leading-none tabular-nums transition-colors"
      :class="isActive
        ? (app.theme === 'dark' ? 'text-brand-300' : 'text-gray-700')
        : (app.theme === 'dark' ? 'text-gray-600' : 'text-gray-400')"
    >
      {{ index + 1 }}
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-sm leading-snug transition-colors group-hover:font-medium"
         v-if="!transcript.isEditing"
         :class="isActive
            ? (app.theme === 'dark' ? 'text-white font-medium' : 'text-black font-medium')
            : (app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500')">
        {{ item.en }}
      </p>
      <div v-else class="space-y-1.5" @click.stop>
        <textarea
          ref="editor"
          :value="item.en"
          rows="2"
          class="w-full resize-none rounded-md border px-2 py-1.5 text-[13px] leading-snug outline-none transition-colors"
          :class="app.theme === 'dark'
            ? 'border-white/10 bg-black/20 text-white focus:border-brand-500/60'
            : 'border-black/10 bg-white text-black focus:border-black/30'"
          @focus="transcript.startEditing(index)"
          @input="onInput"
          @keydown.enter.exact.prevent="splitAtCursor"
        />
        <div class="flex items-center justify-between gap-1.5">
          <span
            v-if="item.status !== 'saved'"
            class="rounded border px-1 py-0.5 text-[9px] font-semibold uppercase leading-none"
            :class="item.status === 'new'
              ? (app.theme === 'dark' ? 'border-emerald-900/60 text-emerald-300' : 'border-emerald-200 text-emerald-700')
              : (app.theme === 'dark' ? 'border-sky-900/60 text-sky-300' : 'border-sky-200 text-sky-700')"
          >
            {{ item.status }}
          </span>
          <span v-else />
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="h-6 w-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
              :class="app.theme === 'dark'
                ? 'text-gray-300 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'"
              :disabled="!canMergePrev"
              title="Merge with previous sentence"
              @click="transcript.mergeWithPrev(index)"
            >
              <Icon name="outdent" :size="13" />
            </button>
            <button
              type="button"
              class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
              :class="app.theme === 'dark'
                ? 'text-gray-300 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'"
              title="Split sentence at cursor"
              @click="splitAtCursor"
            >
              <Icon name="code-compare" :size="13" />
            </button>
            <button
              type="button"
              class="h-6 w-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
              :class="app.theme === 'dark'
                ? 'text-gray-300 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'"
              :disabled="!canMergeNext"
              title="Merge with next sentence"
              @click="transcript.mergeWithNext(index)"
            >
              <Icon name="indent" :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

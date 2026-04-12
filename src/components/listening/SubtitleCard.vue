<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import SentenceEditor from './SentenceEditor.vue'
import Icon from '../Icon.vue'

const props = defineProps<{ item: Sentence; index: number }>()
const emit = defineEmits<{ split: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()

const isActive = computed(() => props.index === player.currentIndex)
const isEditing = computed(() => transcript.isEditing && transcript.editingIndex === props.index)
const isTotalLast = computed(() => transcript.displaySentences.length === 1)

function getSentenceBadge(s: Sentence) {
  if (s.status === 'new') return 'new'
  if (s.status === 'changed' || s.status === 'editing') return 'changed'
  return ''
}

const cardClass = computed(() => {
  if (isEditing.value) {
    return app.theme === 'dark'
      ? 'bg-zinc-900/90 border-zinc-500 shadow-2xl'
      : 'bg-white border-slate-400 shadow-xl'
  }
  if (isActive.value) {
    return app.theme === 'dark'
      ? 'bg-dark-highlight border-brand-500/30 shadow-lg transform scale-[1.02]'
      : 'bg-light-highlight border-gray-300 shadow-lg transform scale-[1.02]'
  }
  return app.theme === 'dark'
    ? 'cursor-pointer hover:bg-dark-card/50 opacity-70 hover:opacity-100'
    : 'cursor-pointer hover:bg-light-card/50 opacity-70 hover:opacity-100'
})

const badgeClass = (status: string) => {
  if (status === 'new') {
    return app.theme === 'dark'
      ? 'border-emerald-900/60 text-emerald-300 bg-emerald-950/30'
      : 'border-emerald-200 text-emerald-700 bg-emerald-50'
  }
  return app.theme === 'dark'
    ? 'border-sky-900/60 text-sky-300 bg-sky-950/30'
    : 'border-sky-200 text-sky-700 bg-sky-50'
}
</script>

<template>
  <div @click="isEditing ? transcript.startEditing(index) : player.seekTo(item.start_ms ?? 0)"
       class="px-3 py-2.5 rounded-lg transition-all duration-300 border border-transparent"
       :class="cardClass">

    <!-- Edit toolbar (shown when editing current row) -->
    <div v-if="isEditing" class="flex items-start justify-between gap-2 mb-2">
      <div class="flex items-center gap-1.5 pt-0.5 flex-shrink-0">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em]"
              :class="app.theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <span v-if="getSentenceBadge(item)"
              class="px-1.5 py-0.5 rounded-full border text-[9px] font-bold tracking-[0.14em]"
              :class="badgeClass(item.status)">
          {{ getSentenceBadge(item) }}
        </span>
      </div>
      <div class="flex items-center gap-1 flex-wrap justify-end">
        <button @click.stop="transcript.startEditing(index)"
                class="w-7 h-7 rounded-md border text-[11px] transition-colors"
                :class="app.theme === 'dark' ? 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500' : 'border-gray-300 text-slate-500 hover:text-black hover:border-gray-400'"
                title="编辑">
          <Icon name="pen" />
        </button>
        <button @click.stop="emit('split', index)"
                class="px-2 h-7 rounded-md border text-[10px] font-bold transition-colors"
                :class="app.theme === 'dark' ? 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white' : 'border-gray-300 text-slate-600 hover:border-gray-400 hover:text-black'"
                title="拆句">拆</button>
        <button @click.stop
                class="px-2 h-7 rounded-md border text-[10px] font-bold transition-colors"
                :class="index === 0
                   ? (app.theme === 'dark' ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed')
                   : (app.theme === 'dark' ? 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white' : 'border-gray-300 text-slate-600 hover:border-gray-400 hover:text-black')"
                :disabled="index === 0" title="与上一句合并">前并</button>
        <button @click.stop
                class="px-2 h-7 rounded-md border text-[10px] font-bold transition-colors"
                :class="index === transcript.displaySentences.length - 1
                   ? (app.theme === 'dark' ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed')
                   : (app.theme === 'dark' ? 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white' : 'border-gray-300 text-slate-600 hover:border-gray-400 hover:text-black')"
                :disabled="index === transcript.displaySentences.length - 1" title="与下一句合并">后并</button>
        <button @click.stop="transcript.cancelEdits()"
                class="w-7 h-7 rounded-md border text-[11px] transition-colors"
                :class="isTotalLast
                   ? (app.theme === 'dark' ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed')
                   : (app.theme === 'dark' ? 'border-red-900/60 text-red-400 hover:border-red-500 hover:text-red-300' : 'border-red-200 text-red-500 hover:border-red-400 hover:text-red-600')"
                :disabled="isTotalLast" title="删除">
          <Icon name="trash" />
        </button>
      </div>
    </div>

    <!-- Normal sentence display -->
    <div v-if="!isEditing" class="flex items-start gap-2.5">
      <div class="flex items-center gap-1.5 pt-0.5 flex-shrink-0">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em]"
              :class="app.theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <span v-if="getSentenceBadge(item)"
              class="px-1.5 py-0.5 rounded-full border text-[9px] font-bold tracking-[0.14em]"
              :class="badgeClass(item.status)">
          {{ getSentenceBadge(item) }}
        </span>
      </div>
      <p class="text-base font-medium leading-6 transition-all duration-300 flex-1"
         :class="[
           isActive ? (app.theme === 'dark' ? 'text-brand-100' : 'text-black') : (app.theme === 'dark' ? 'text-gray-300' : 'text-gray-600'),
           player.showEn ? '' : 'blur-md opacity-50 select-none'
         ]">
        {{ item.en }}
      </p>
    </div>

    <!-- SentenceEditor (editing mode) -->
    <SentenceEditor v-if="isEditing" :index="index" :sentence-id="item.id" @split="emit('split', index)" />

    <!-- Issues tags -->
    <div v-if="item.issues?.length" class="mt-2 flex flex-wrap gap-1.5">
      <span v-for="issue in item.issues" :key="issue"
            class="text-[10px] px-2 py-0.5 rounded-full border"
            :class="app.theme === 'dark' ? 'border-amber-900/60 text-amber-300 bg-amber-950/30' : 'border-amber-200 text-amber-700 bg-amber-50'">
        {{ issue }}
      </span>
    </div>
  </div>
</template>

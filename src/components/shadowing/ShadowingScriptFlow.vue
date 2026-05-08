<script setup lang="ts">
import { nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import ScriptFlowItem from './ScriptFlowItem.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
const MIN_SUBTITLE_SYNC_LEAD_MS = 80
const MAX_SUBTITLE_SYNC_LEAD_MS = 220

const itemRefs = ref<Record<number, HTMLElement | null>>({})

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value))
}

function getAdaptiveLeadMs(startMs?: number, endMs?: number): number {
  const diff = (endMs ?? startMs ?? 0) - (startMs ?? 0)
  const duration = diff > 0 ? diff : 1000
  return clamp(Math.round(duration * 0.35), MIN_SUBTITLE_SYNC_LEAD_MS, MAX_SUBTITLE_SYNC_LEAD_MS)
}

function setItemRef(el: Element | ComponentPublicInstance | null, index: number) {
  itemRefs.value[index] = el && '$el' in el ? (el as ComponentPublicInstance).$el as HTMLElement : el as HTMLElement | null
}

function getCurrentSubtitleIndex(positionMs: number, sentences: Sentence[]) {
  let index = 0
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const start = sentence.start_ms ?? 0
    const lead = getAdaptiveLeadMs(sentence.start_ms, sentence.end_ms)
    if (Math.max(0, positionMs + lead) >= start) index = i
    else break
  }
  return index
}

function selectSentence(index: number, sentence: Sentence) {
  player.setCurrentIndex(index)
  if (app.mode === 'listening') {
    void player.seekTo(sentence.start_ms ?? 0)
  }
}

watch(() => player.positionMs, (positionMs) => {
  if (player.seeking || positionMs == null || !transcript.sentences.length) return

  const index = getCurrentSubtitleIndex(positionMs, transcript.sentences)
  if (index !== player.currentIndex) player.setCurrentIndex(index)
}, { immediate: true })

watch(() => player.currentIndex, async (index) => {
  await nextTick()
  itemRefs.value[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})
</script>

<template>
  <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex flex-col z-10 transition-colors min-h-0 h-[48vh] lg:h-full"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 transition-colors"
         :class="app.theme === 'dark' ? 'border-dark-border' : 'border-light-border'">
      <h3 class="text-xs font-bold uppercase tracking-wide"
          :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">Script Flow</h3>
      <span class="text-xs font-mono"
            :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">
        {{ player.currentIndex + 1 }}/{{ transcript.sentences.length }}
      </span>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
      <ScriptFlowItem
        v-for="(item, index) in transcript.sentences"
        :key="item.id"
        :ref="(el) => setItemRef(el as any, index)"
        :item="item"
        :index="index"
        @click="selectSentence(index, item)"
      />
    </div>
  </div>
</template>

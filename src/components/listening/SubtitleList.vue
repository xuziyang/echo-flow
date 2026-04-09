<script setup lang="ts">
import { ref, watch, nextTick, type ComponentPublicInstance } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import SubtitleCard from './SubtitleCard.vue'

const app = useAppStore()
const transcript = useTranscriptStore()
const player = usePlayerStore()
const MIN_SUBTITLE_SYNC_LEAD_MS = 80
const MAX_SUBTITLE_SYNC_LEAD_MS = 220

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value))
}

function getAdaptiveLeadMs(startMs?: number, endMs?: number): number {
  const diff = (endMs ?? startMs ?? 0) - (startMs ?? 0)
  const duration = diff > 0 ? diff : 1000
  return clamp(Math.round(duration * 0.35), MIN_SUBTITLE_SYNC_LEAD_MS, MAX_SUBTITLE_SYNC_LEAD_MS)
}

// Refs for each subtitle card, keyed by index
const cardRefs = ref<Record<number, HTMLElement | null>>({})

function setCardRef(el: Element | ComponentPublicInstance | null, index: number) {
  cardRefs.value[index] = el && '$el' in el ? (el as any).$el : (el as HTMLElement | null)
}

// Scroll active subtitle into view whenever currentIndex changes
watch(() => player.currentIndex, async (idx) => {
  await nextTick()
  const el = cardRefs.value[idx]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

// Sync currentIndex based on playback position
watch(() => player.positionMs, (pos) => {
  if (pos == null || !transcript.sentences.length) return
  const sents = transcript.sentences
  let idx = 0
  for (let i = 0; i < sents.length; i++) {
    const start = sents[i].start_ms ?? 0
    const lead = getAdaptiveLeadMs(sents[i].start_ms, sents[i].end_ms)
    const adjustedPos = Math.max(0, pos + lead)
    if (adjustedPos >= start) idx = i
    else break
  }
  if (idx !== player.currentIndex) player.currentIndex = idx
}, { immediate: true })
</script>

<template>
  <div class="flex-1 w-full max-w-3xl overflow-y-auto no-scrollbar relative" id="subtitle-container">
    <!-- 转写中状态 -->
    <div v-if="transcript.isTranscribing" class="flex flex-col items-center justify-center py-16 gap-3">
      <div class="flex gap-1.5">
        <span v-for="i in 3" :key="i"
              class="w-2 h-2 rounded-full bg-brand-500 animate-bounce"
              :style="`animation-delay: ${(i-1) * 0.15}s`"></span>
      </div>
      <p class="text-sm" :class="app.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'">
        转写中… {{ Math.round(transcript.transcribeProgress) }}%
      </p>
    </div>

    <!-- 无字幕且未转写 -->
    <div v-else-if="transcript.displaySentences.length === 0"
         class="flex flex-col items-center justify-center py-16 gap-2">
      <p class="text-sm" :class="app.theme === 'dark' ? 'text-gray-600' : 'text-gray-400'">
        打开音频文件后将自动转写并显示字幕
      </p>
    </div>

    <!-- 字幕列表 -->
    <div v-else class="space-y-1.5 pb-20">
      <SubtitleCard
        v-for="(item, index) in transcript.displaySentences"
        :key="item.id"
        :ref="(el) => setCardRef(el as any, index)"
        :item="item"
        :index="index"
        @split="(idx) => transcript.updateDraft(idx, transcript.draftSentences[idx]?.en || '')"
      />
    </div>
  </div>
</template>

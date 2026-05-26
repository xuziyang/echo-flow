<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import { buildWaveformBars, getWaveformBarCount, getWaveformPixelWidth } from '../../composables/useWaveformBars'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
const waveformAreaRef = ref<HTMLElement | null>(null)
const waveformAreaWidth = ref(0)

let resizeObserver: ResizeObserver | null = null

const currentSentence = computed(() => transcript.sentences[player.currentIndex])

const sentenceSamples = computed(() => {
  const sentence = currentSentence.value
  const samples = player.waveformSamples
  if (
    samples.length === 0
    || player.durationMs <= 0
    || !Number.isFinite(sentence?.start_ms)
    || !Number.isFinite(sentence?.end_ms)
    || (sentence?.end_ms ?? 0) <= (sentence?.start_ms ?? 0)
  ) {
    return []
  }

  const startRatio = Math.max(0, Math.min(1, (sentence!.start_ms as number) / player.durationMs))
  const endRatio = Math.max(startRatio, Math.min(1, (sentence!.end_ms as number) / player.durationMs))
  const startIndex = Math.floor(startRatio * samples.length)
  const endIndex = Math.max(startIndex + 1, Math.ceil(endRatio * samples.length))

  return samples.slice(startIndex, endIndex)
})

const sentenceDurationMs = computed(() => {
  const sentence = currentSentence.value
  if (
    !Number.isFinite(sentence?.start_ms)
    || !Number.isFinite(sentence?.end_ms)
    || (sentence?.end_ms ?? 0) <= (sentence?.start_ms ?? 0)
  ) {
    return 0
  }

  return (sentence!.end_ms as number) - (sentence!.start_ms as number)
})

const barCount = computed(() => getWaveformBarCount(
  sentenceDurationMs.value,
  currentSentence.value?.en,
  waveformAreaWidth.value,
))
const waveformPixelWidth = computed(() => getWaveformPixelWidth(barCount.value))
const waveformBars = computed(() => buildWaveformBars(sentenceSamples.value, barCount.value, 1))

const playedBarIndex = computed(() => {
  const sentence = currentSentence.value
  if (
    waveformBars.value.length === 0
    || !Number.isFinite(sentence?.start_ms)
    || !Number.isFinite(sentence?.end_ms)
    || (sentence?.end_ms ?? 0) <= (sentence?.start_ms ?? 0)
  ) {
    return -1
  }

  const startMs = sentence!.start_ms as number
  const endMs = sentence!.end_ms as number
  const progress = Math.max(0, Math.min(1, (player.positionMs - startMs) / (endMs - startMs)))
  return Math.floor(progress * waveformBars.value.length)
})

function observeWaveformArea(element: HTMLElement | null) {
  resizeObserver?.disconnect()

  if (!element) {
    waveformAreaWidth.value = 0
    return
  }

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    waveformAreaWidth.value = entry.contentRect.width
  })

  resizeObserver.observe(element)
  waveformAreaWidth.value = element.clientWidth
}

onMounted(() => {
  observeWaveformArea(waveformAreaRef.value)
  watch(waveformAreaRef, observeWaveformArea)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div class="flex-1 relative border-b flex flex-col justify-center group transition-colors"
       :class="app.theme === 'dark' ? 'bg-dark-bg/50 border-dark-border' : 'bg-white border-light-border'">
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors"
            :class="app.theme === 'dark' ? 'bg-brand-900/50 text-brand-400 border border-brand-900' : 'bg-gray-100 text-gray-500 border border-gray-200'">Original</span>
    </div>



    <div ref="waveformAreaRef" class="h-24 w-full px-8 flex items-center justify-center">
      <div
        v-if="waveformBars.length > 0"
        class="flex h-full max-w-3xl items-center justify-center gap-[4px] overflow-hidden"
        :style="{ width: `${waveformPixelWidth}px`, maxWidth: '100%' }"
      >
        <div
          v-for="bar in waveformBars"
          :key="bar.index"
          class="w-px shrink-0 rounded-[1px] transition-[height,background-color,opacity] duration-150"
          :class="bar.index <= playedBarIndex
            ? 'bg-red-500/90'
            : (app.theme === 'dark' ? 'bg-red-400/34' : 'bg-red-500/30')"
          :style="{ height: `${bar.height}%` }"
        />
      </div>
      <div v-else
           class="h-px w-full max-w-3xl"
           :class="app.theme === 'dark' ? 'bg-brand-500/20' : 'bg-black/10'" />
    </div>
  </div>
</template>

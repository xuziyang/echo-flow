<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import { buildWaveformBars, getWaveformBarCount, getWaveformPixelWidth } from '../../composables/useWaveformBars'
import PlaybackControls from './PlaybackControls.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
const waveformAreaRef = ref<HTMLElement | null>(null)
const waveformAreaWidth = ref(0)

let resizeObserver: ResizeObserver | null = null

const trackName = computed(() => {
  if (!player.currentPath) return 'No audio loaded'
  const parts = player.currentPath.split(/[\\/]/)
  return parts[parts.length - 1] || 'Unknown track'
})

const statusLabel = computed(() => {
  if (transcript.isTranscribing) return `Generating subtitles ${Math.round(transcript.transcribeProgress)}%`
  if (transcript.transcribeError) return 'Subtitle generation failed'
  if (!player.currentPath || player.durationMs <= 0) return 'Ready'
  return player.isPlaying ? 'Playing' : 'Paused'
})

const statusTone = computed(() => {
  if (transcript.transcribeError) return 'error'
  if (transcript.isTranscribing) return 'working'
  if (player.isPlaying) return 'active'
  return 'idle'
})

const currentSentence = computed(() => transcript.sentences[player.currentIndex])
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
const sentenceWaveformSamples = computed(() => {
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
const waveformBars = computed(() => buildWaveformBars(sentenceWaveformSamples.value, barCount.value, 1))
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
  <div class="relative w-full max-w-3xl rounded-2xl p-4 sm:p-5 border shadow-2xl flex flex-col gap-4 flex-shrink-0 z-10 overflow-hidden transition-colors duration-300"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -top-10 right-8 h-28 w-28 rounded-full blur-2xl opacity-40"
           :class="app.theme === 'dark' ? 'bg-sky-400/20' : 'bg-sky-500/15'" />
      <div class="absolute -bottom-12 -left-10 h-36 w-36 rounded-full blur-2xl opacity-45"
           :class="app.theme === 'dark' ? 'bg-cyan-300/15' : 'bg-cyan-500/12'" />
    </div>

    <div class="relative z-10 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em]"
           :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
          Playback
        </p>
        <h3 class="mt-1 text-sm font-semibold truncate"
            :class="app.theme === 'dark' ? 'text-gray-100' : 'text-gray-900'">
          {{ trackName }}
        </h3>
      </div>

      <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
            :class="[
              app.theme === 'dark'
                ? 'border-white/12 bg-white/5 text-gray-300'
                : 'border-black/10 bg-black/[0.03] text-gray-600',
              statusTone === 'error' ? (app.theme === 'dark' ? 'text-red-200' : 'text-red-700') : '',
            ]">
        <span class="h-1.5 w-1.5 rounded-full"
              :class="{
                'bg-emerald-400': statusTone === 'active',
                'bg-sky-400 animate-pulse': statusTone === 'working',
                'bg-red-400': statusTone === 'error',
                'bg-gray-400': statusTone === 'idle',
              }" />
        {{ statusLabel }}
      </span>
    </div>

    <div ref="waveformAreaRef" class="relative z-10 h-24 w-full px-8 flex items-center justify-center">
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

    <p
      v-if="currentSentence?.en"
      class="relative z-10 -mt-1 text-center text-sm leading-relaxed"
      :class="app.theme === 'dark' ? 'text-gray-200' : 'text-gray-800'"
    >
      {{ currentSentence.en }}
    </p>

    <div class="relative z-10">
      <PlaybackControls />
    </div>
  </div>
</template>

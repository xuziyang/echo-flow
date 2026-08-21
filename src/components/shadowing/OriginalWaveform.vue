<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import BarWave from '../common/BarWave.vue'

const player = usePlayerStore()
const transcript = useTranscriptStore()

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

const sentenceProgress = computed(() => {
  if (sentenceDurationMs.value <= 0) return 0
  const startMs = currentSentence.value!.start_ms as number
  return Math.max(0, Math.min(1, (player.positionMs - startMs) / sentenceDurationMs.value))
})
</script>

<template>
  <BarWave
    v-if="sentenceSamples.length"
    :samples="sentenceSamples"
    :progress="sentenceProgress"
    :duration-ms="sentenceDurationMs"
    :text="currentSentence?.en ?? ''"
  />
  <div v-else class="wave-empty">
    {{ transcript.isTranscribing ? '正在生成字幕…' : '暂无波形' }}
  </div>
</template>

<script setup lang="ts">
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import BarWave from '../common/BarWave.vue'
import { useSentenceWaveform } from '../../composables/useSentenceWaveform'

const transcript = useTranscriptStore()
const { currentSentence, sentenceSamples, sentenceDurationMs, sentenceProgress } = useSentenceWaveform()
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

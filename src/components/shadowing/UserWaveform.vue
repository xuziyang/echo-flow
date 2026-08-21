<script setup lang="ts">
import { computed } from 'vue'
import { useRecordingStore } from '../../stores/useRecordingStore'
import BarWave from '../common/BarWave.vue'

const recording = useRecordingStore()

const hasContent = computed(() => recording.isRecording || recording.userWaveformSamples.length > 0)

/* 录音波形时长：优先用已保存时长，录音中按采样数估算（640 采样 ≈ 5 秒） */
const waveformDurationMs = computed(() => {
  if (recording.recordingDurationMs > 0) return recording.recordingDurationMs
  if (!recording.isRecording || recording.userWaveformSamples.length === 0) return 0
  return Math.round((recording.userWaveformSamples.length / 640) * 5000)
})
</script>

<template>
  <BarWave
    v-if="hasContent"
    :samples="recording.userWaveformSamples"
    :progress="1"
    variant="mine"
    :duration-ms="waveformDurationMs"
  />
  <div v-else class="wave-empty">
    还没有录音 —— 按 <kbd>R</kbd> 或点「录音」，跟着原音说一遍
  </div>
</template>

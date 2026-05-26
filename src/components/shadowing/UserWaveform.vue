<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { buildWaveformBars, getWaveformBarCount, getWaveformPixelWidth } from '../../composables/useWaveformBars'

const app = useAppStore()
const recording = useRecordingStore()
const waveformAreaRef = ref<HTMLElement | null>(null)
const waveformAreaWidth = ref(0)

let resizeObserver: ResizeObserver | null = null

const hasRecording = computed(() => Boolean(recording.userAudioUrl))
const hasWaveform = computed(() => recording.userWaveformSamples.length > 0)
const recordingWaveformDurationMs = computed(() => {
  if (recording.recordingDurationMs > 0) return recording.recordingDurationMs
  if (!recording.isRecording || recording.userWaveformSamples.length === 0) return 0

  return Math.round((recording.userWaveformSamples.length / 640) * 5000)
})
const barCount = computed(() => getWaveformBarCount(
  recordingWaveformDurationMs.value,
  '',
  waveformAreaWidth.value,
))
const waveformPixelWidth = computed(() => getWaveformPixelWidth(barCount.value))
const waveformBars = computed(() => buildWaveformBars(recording.userWaveformSamples, barCount.value, 1))
const userWaveformClass = computed(() => {
  if (recording.isRecording) return 'bg-red-500/95'
  if (app.theme === 'dark') {
    return recording.activePlaybackMode ? 'bg-red-300/90' : 'bg-red-400/42'
  }
  return recording.activePlaybackMode ? 'bg-red-600/82' : 'bg-red-500/36'
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
  <div class="flex-1 relative flex flex-col justify-center group border-t transition-colors"
       :class="app.theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-gray-50 border-gray-200'">
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-colors"
            :class="app.theme === 'dark' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-white text-gray-500 border border-gray-200'">You</span>
    </div>



    <!-- 录音中动画 -->
    <div
      v-if="recording.isRecording"
      ref="waveformAreaRef"
      class="w-full h-24 px-6 md:px-8 flex items-center justify-center"
    >
      <div
        class="flex h-full max-w-3xl items-center justify-center gap-[4px] overflow-hidden"
        :style="{ width: `${waveformPixelWidth}px`, maxWidth: '100%' }"
      >
        <div
          v-for="bar in waveformBars"
          :key="`live-wave-${bar.index}`"
          class="w-px shrink-0 rounded-[1px] transition-all duration-100"
          :class="userWaveformClass"
          :style="{ height: `${bar.height}%` }"
        />
        <div v-if="!hasWaveform" class="h-px w-full bg-red-500/25" />
      </div>
    </div>

    <div
      v-else-if="hasRecording"
      ref="waveformAreaRef"
      class="w-full h-24 px-6 md:px-8 flex items-center justify-center"
    >
      <div
        class="flex h-full max-w-3xl items-center justify-center gap-[4px] overflow-hidden"
        :style="{ width: `${waveformPixelWidth}px`, maxWidth: '100%' }"
      >
        <div
          v-for="bar in waveformBars"
          :key="`wave-${bar.index}`"
          class="w-px shrink-0 rounded-[1px] transition-colors duration-150"
          :class="userWaveformClass"
          :style="{ height: `${bar.height}%` }"
        />
      </div>
    </div>

    <!-- 无数据时占位 -->
    <div v-else class="w-full px-10 h-24 flex items-center justify-center">
      <span class="text-sm font-light tracking-wide"
            :class="app.theme === 'dark' ? 'text-zinc-600' : 'text-gray-400'">Tap microphone to record</span>
    </div>
  </div>
</template>

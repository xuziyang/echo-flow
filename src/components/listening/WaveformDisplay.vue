<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useWaveform } from '../../composables/useWaveform'

const app = useAppStore()
const player = usePlayerStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const progress = computed(() =>
  player.durationMs > 0 ? player.positionMs / player.durationMs : 0
)

const colors = computed(() => ({
  activeColor: app.theme === 'dark' ? '#5e93c4' : '#4f88b8',
  inactiveColor: app.theme === 'dark' ? 'rgba(96,140,182,0.45)' : 'rgba(79,136,184,0.55)',
  playedColor: app.theme === 'dark' ? '#76abd8' : '#5f99c7',
  backgroundColor: app.theme === 'dark' ? '#191d22' : '#ececec',
  gridColor: app.theme === 'dark' ? 'rgba(130,145,163,0.16)' : 'rgba(127,135,145,0.2)',
  centerLineColor: app.theme === 'dark' ? 'rgba(158,171,186,0.48)' : 'rgba(108,117,127,0.45)',
}))

useWaveform(canvasRef, {
  samples: computed(() => player.waveformSamples),
  isPlaying: computed(() => player.isPlaying),
  progress,
  activeColor: computed(() => colors.value.activeColor),
  inactiveColor: computed(() => colors.value.inactiveColor),
  playedColor: computed(() => colors.value.playedColor),
  backgroundColor: computed(() => colors.value.backgroundColor),
  gridColor: computed(() => colors.value.gridColor),
  centerLineColor: computed(() => colors.value.centerLineColor),
})
</script>

<template>
  <div class="h-24 relative rounded-md overflow-hidden border"
       :class="app.theme === 'dark' ? 'border-dark-border' : 'border-gray-300'">
      <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />
  </div>
</template>

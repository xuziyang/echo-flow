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
  activeColor: app.theme === 'dark' ? '#6366f1' : '#4f46e5',
  inactiveColor: app.theme === 'dark' ? 'rgba(99,102,241,0.3)' : 'rgba(79,70,229,0.25)',
  playedColor: app.theme === 'dark' ? '#818cf8' : '#6366f1',
}))

useWaveform(canvasRef, {
  samples: computed(() => player.waveformSamples),
  isPlaying: computed(() => player.isPlaying),
  progress,
  activeColor: colors.value.activeColor,
  inactiveColor: colors.value.inactiveColor,
  playedColor: colors.value.playedColor,
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="h-16 relative">
      <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />
    </div>
  </div>
</template>

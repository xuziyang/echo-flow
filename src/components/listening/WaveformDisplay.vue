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
const progressPercent = computed(() => `${Math.round(progress.value * 100)}%`)

const colors = computed(() => ({
  activeColor: app.theme === 'dark' ? '#5e93c4' : '#4f88b8',
  inactiveColor: app.theme === 'dark' ? 'rgba(96,140,182,0.45)' : 'rgba(79,136,184,0.55)',
  playedColor: app.theme === 'dark' ? '#76abd8' : '#5f99c7',
  backgroundColor: app.theme === 'dark' ? '#191d22' : '#ececec',
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
  centerLineColor: computed(() => colors.value.centerLineColor),
})
</script>

<template>
  <div class="h-24 relative rounded-xl overflow-hidden border"
       :class="app.theme === 'dark'
         ? 'border-white/10 bg-gradient-to-b from-[#1d232a] to-[#151a20]'
         : 'border-black/10 bg-gradient-to-b from-[#f7fbff] to-[#ecf1f6]'">
    <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />

    <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent" />

    <div class="pointer-events-none absolute inset-x-3 top-1.5 flex items-center justify-between text-[9px] font-medium tracking-wide"
         :class="app.theme === 'dark' ? 'text-gray-400/90' : 'text-gray-600/90'">
      <span>Waveform</span>
      <span>{{ progressPercent }}</span>
    </div>
  </div>
</template>

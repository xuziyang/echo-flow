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
const zoomLabel = computed(() => `${player.waveformZoom.toFixed(2).replace(/\.?0+$/, '')}x`)

function onWaveformWheel(event: WheelEvent) {
  // In most browsers, pinch-to-zoom on trackpads emits wheel events with ctrlKey=true.
  if (!event.ctrlKey) return
  event.preventDefault()

  if (event.deltaY < 0) {
    player.zoomInWaveform()
  } else if (event.deltaY > 0) {
    player.zoomOutWaveform()
  }
}

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
  zoom: computed(() => player.waveformZoom),
  activeColor: computed(() => colors.value.activeColor),
  inactiveColor: computed(() => colors.value.inactiveColor),
  playedColor: computed(() => colors.value.playedColor),
  backgroundColor: computed(() => colors.value.backgroundColor),
  gridColor: computed(() => colors.value.gridColor),
  centerLineColor: computed(() => colors.value.centerLineColor),
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-end gap-2 text-[11px]">
      <span class="font-mono tabular-nums px-2 py-1 rounded border"
            :class="app.theme === 'dark' ? 'text-gray-300 border-dark-border bg-dark-bg' : 'text-gray-600 border-light-border bg-white'">
        {{ zoomLabel }}
      </span>
      <button class="px-2 py-1 rounded border transition-colors"
              :class="app.theme === 'dark' ? 'border-dark-border text-gray-300 hover:text-white hover:border-gray-500' : 'border-light-border text-gray-600 hover:text-black hover:border-gray-400'"
              @click="player.zoomOutWaveform()">
        -
      </button>
      <button class="px-2 py-1 rounded border transition-colors"
              :class="app.theme === 'dark' ? 'border-dark-border text-gray-300 hover:text-white hover:border-gray-500' : 'border-light-border text-gray-600 hover:text-black hover:border-gray-400'"
              @click="player.zoomInWaveform()">
        +
      </button>
      <button class="px-2 py-1 rounded border transition-colors"
              :class="app.theme === 'dark' ? 'border-dark-border text-gray-300 hover:text-white hover:border-gray-500' : 'border-light-border text-gray-600 hover:text-black hover:border-gray-400'"
              @click="player.resetWaveformZoom()">
        Reset
      </button>
    </div>
    <div class="h-24 relative rounded-md overflow-hidden border"
         :class="app.theme === 'dark' ? 'border-dark-border' : 'border-gray-300'"
         @wheel="onWaveformWheel">
      <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />
    </div>
  </div>
</template>

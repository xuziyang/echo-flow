<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useWaveform } from '../../composables/useWaveform'
import Icon from '../Icon.vue'

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
  <div class="flex-1 relative border-b flex flex-col justify-center group transition-colors"
       :class="app.theme === 'dark' ? 'bg-dark-bg/50 border-dark-border' : 'bg-white border-light-border'">
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors"
            :class="app.theme === 'dark' ? 'bg-brand-900/50 text-brand-400 border border-brand-900' : 'bg-gray-100 text-gray-500 border border-gray-200'">Original</span>
    </div>

    <div class="absolute top-4 right-8 z-10 flex items-center gap-2">
      <button @click="player.toggleMute()" class="w-5 focus:outline-none text-right" title="Mute/Unmute">
        <Icon :name="player.volume == 0 ? 'volume-xmark' : (player.volume < 50 ? 'volume-low' : 'volume-high')" class="transition-colors text-sm" :class="app.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'" />
      </button>
    </div>

    <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />
  </div>
</template>

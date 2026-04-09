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
  activeColor: app.theme === 'dark' ? '#6366f1' : '#4f46e5',   // brand-500
  inactiveColor: app.theme === 'dark' ? 'rgba(99,102,241,0.3)' : 'rgba(79,70,229,0.25)',
  playedColor: app.theme === 'dark' ? '#818cf8' : '#6366f1', // brand-400
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

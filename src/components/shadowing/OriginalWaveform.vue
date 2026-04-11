<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const player = usePlayerStore()

// 100 animated bars matching ui/index.html
const animatedBars = Array.from({ length: 100 }, (_, i) => ({
  index: i,
  // Random height between 20%–100% — matches Math.random() * 80 + 20
  height: Math.floor(Math.random() * 80 + 20),
}))
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

    <div class="h-24 w-full px-10 flex items-center justify-center gap-1">
      <div
        v-for="bar in animatedBars"
        :key="bar.index"
        class="w-1.5 rounded-full transition-all"
        :class="[player.isPlaying ? 'animate-wave' : '', app.theme === 'dark' ? 'bg-brand-500/40' : 'bg-black/20']"
        :style="{ height: `${bar.height}%` }"
      />
    </div>
  </div>
</template>

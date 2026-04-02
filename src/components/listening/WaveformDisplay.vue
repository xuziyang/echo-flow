<!-- src/components/listening/WaveformDisplay.vue -->
<script setup lang="ts">
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useAppStore } from '../../stores/useAppStore'
import { computed } from 'vue'

const player = usePlayerStore()
const app = useAppStore()

// 120 static bars with random heights (generated once on mount)
const bars = Array.from({ length: 120 }, () => ({
  height: Math.random() * 80 + 20,
  isActive: false,
}))

function getBarClass(bar: { height: number; isActive: boolean }) {
  if (app.theme === 'dark') {
    return bar.isActive ? 'bg-brand-500' : 'bg-gray-700'
  }
  return bar.isActive ? 'bg-black' : 'bg-gray-300'
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="h-16 flex items-center gap-[2px] overflow-hidden relative">
      <div v-for="(bar, i) in bars" :key="i"
           class="w-1 rounded-full transition-all duration-150"
           :class="getBarClass(bar)"
           :style="`height: ${bar.height}%`">
      </div>
      <!-- Progress indicator at 37% -->
      <div class="absolute left-[37%] top-0 bottom-0 w-0.5 flex flex-col items-center justify-center"
           :class="app.theme === 'dark' ? 'bg-white' : 'bg-black'">
        <div class="w-3 h-3 rounded-full border-2 shadow-lg"
             :class="app.theme === 'dark' ? 'bg-brand-500 border-white' : 'bg-black border-white'"></div>
      </div>
    </div>
  </div>
</template>

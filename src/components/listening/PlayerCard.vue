<!-- src/components/listening/PlayerCard.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import WaveformDisplay from './WaveformDisplay.vue'
import PlaybackControls from './PlaybackControls.vue'

const app = useAppStore()
</script>

<template>
  <div class="w-full max-w-3xl rounded-2xl p-6 border shadow-2xl flex flex-col gap-6 flex-shrink-0 z-10 transition-colors duration-300"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-bold uppercase tracking-wide"
          :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">Intensive Listening</h3>
      <button class="transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-black'">
        <i class="fa-solid fa-ellipsis"></i>
      </button>
    </div>
    <WaveformDisplay />
    <PlaybackControls />
  </div>
</template>

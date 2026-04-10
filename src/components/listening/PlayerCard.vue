<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import WaveformDisplay from './WaveformDisplay.vue'
import PlaybackControls from './PlaybackControls.vue'

const app = useAppStore()
</script>

<template>
  <div class="w-full max-w-3xl rounded-2xl p-6 border shadow-2xl flex flex-col gap-6 flex-shrink-0 z-10 transition-colors duration-300"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <WaveformDisplay />
    <PlaybackControls />
  </div>
</template>

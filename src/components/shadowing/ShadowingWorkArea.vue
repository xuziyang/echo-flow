<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import WaveformComparison from './WaveformComparison.vue'
import Icon from '../Icon.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
</script>

<template>
  <div class="flex-1 flex flex-col p-6 gap-6 animate-fade-in overflow-y-auto">
    <!-- Top hint -->
    <div class="flex justify-between items-end px-2">
      <div>
        <button @click="app.switchMode('listening')"
                class="text-sm mb-2 flex items-center gap-1 transition-colors"
                :class="app.theme === 'dark' ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-black'">
          <Icon name="arrow-left" /> Back to Listening
        </button>
      </div>
    </div>

    <!-- Main Card -->
    <div class="flex-1 rounded-2xl border shadow-sm flex flex-col overflow-hidden transition-colors"
         :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
      <!-- Text Reference -->
      <div class="p-8 border-b z-10 transition-colors flex items-center justify-between gap-4"
           :class="app.theme === 'dark' ? 'border-dark-border bg-dark-card' : 'border-light-border bg-light-card'">
        <button @click="player.prevSentence()"
                class="p-2 rounded-full transition-colors flex-shrink-0"
                :class="app.theme === 'dark' ? 'hover:bg-white/10 text-gray-500 hover:text-white' : 'hover:bg-black/5 text-gray-400 hover:text-black'"
                :disabled="player.currentIndex === 0"
                :style="player.currentIndex === 0 ? 'opacity: 0.3; cursor: not-allowed;' : ''"
                title="← Previous sentence">
          <Icon name="chevron-left" class="text-lg" />
        </button>

        <div class="text-center flex-1">
          <p class="text-2xl font-medium" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">
            {{ transcript.sentences[player.currentIndex]?.en }}
          </p>
        </div>

        <button @click="player.nextSentence(transcript.sentences.length - 1)"
                class="p-2 rounded-full transition-colors flex-shrink-0"
                :class="app.theme === 'dark' ? 'hover:bg-white/10 text-gray-500 hover:text-white' : 'hover:bg-black/5 text-gray-400 hover:text-black'"
                :disabled="player.currentIndex === transcript.sentences.length - 1"
                :style="player.currentIndex === transcript.sentences.length - 1 ? 'opacity: 0.3; cursor: not-allowed;' : ''"
                title="→ Next sentence">
          <Icon name="chevron-right" class="text-lg" />
        </button>
      </div>

      <!-- Waveform Comparison -->
      <WaveformComparison />
    </div>
  </div>
</template>

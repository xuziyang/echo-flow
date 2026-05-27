<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import PlaybackControls from './PlaybackControls.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()

const trackName = computed(() => {
  if (!player.currentPath) return 'No audio loaded'
  const parts = player.currentPath.split(/[\\/]/)
  return parts[parts.length - 1] || 'Unknown track'
})

const statusLabel = computed(() => {
  if (transcript.isTranscribing) return `Generating subtitles ${Math.round(transcript.transcribeProgress)}%`
  if (transcript.transcribeError) return 'Subtitle generation failed'
  if (!player.currentPath || player.durationMs <= 0) return 'Ready'
  return player.isPlaying ? 'Playing' : 'Paused'
})

const statusTone = computed(() => {
  if (transcript.transcribeError) return 'error'
  if (transcript.isTranscribing) return 'working'
  if (player.isPlaying) return 'active'
  return 'idle'
})
</script>

<template>
  <div class="relative w-full max-w-3xl rounded-2xl p-4 sm:p-5 border shadow-2xl flex flex-col gap-4 flex-shrink-0 z-10 overflow-hidden transition-colors duration-300"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -top-10 right-8 h-28 w-28 rounded-full blur-2xl opacity-40"
           :class="app.theme === 'dark' ? 'bg-sky-400/20' : 'bg-sky-500/15'" />
      <div class="absolute -bottom-12 -left-10 h-36 w-36 rounded-full blur-2xl opacity-45"
           :class="app.theme === 'dark' ? 'bg-cyan-300/15' : 'bg-cyan-500/12'" />
    </div>

    <div class="relative z-10 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em]"
           :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
          Playback
        </p>
        <h3 class="mt-1 text-sm font-semibold truncate"
            :class="app.theme === 'dark' ? 'text-gray-100' : 'text-gray-900'">
          {{ trackName }}
        </h3>
      </div>

      <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
            :class="[
              app.theme === 'dark'
                ? 'border-white/12 bg-white/5 text-gray-300'
                : 'border-black/10 bg-black/[0.03] text-gray-600',
              statusTone === 'error' ? (app.theme === 'dark' ? 'text-red-200' : 'text-red-700') : '',
            ]">
        <span class="h-1.5 w-1.5 rounded-full"
              :class="{
                'bg-emerald-400': statusTone === 'active',
                'bg-sky-400 animate-pulse': statusTone === 'working',
                'bg-red-400': statusTone === 'error',
                'bg-gray-400': statusTone === 'idle',
              }" />
        {{ statusLabel }}
      </span>
    </div>

    <div class="relative z-10">
      <PlaybackControls />
    </div>
  </div>
</template>

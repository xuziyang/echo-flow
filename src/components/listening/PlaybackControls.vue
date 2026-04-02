<script setup lang="ts">
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import Icon from '../Icon.vue'

const player = usePlayerStore()
const app = useAppStore()
const transcript = useTranscriptStore()

function volumeIcon() {
  if (player.volume === 0) return 'volume-xmark'
  if (player.volume < 50) return 'volume-low'
  return 'volume-high'
}
</script>

<template>
  <div class="grid grid-cols-3 items-center">
    <!-- Left: Rewind -->
    <div class="justify-self-start">
      <button class="text-sm transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-black'">
        <Icon name="rotate-left" class="mr-1" /> 5s
      </button>
    </div>

    <!-- Center: Controls -->
    <div class="flex items-center gap-6 justify-self-center">
      <button @click="player.prevSentence()" class="text-lg transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black'">
        <Icon name="backward-step" />
      </button>
      <button @click="player.togglePlay()"
              class="w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all"
              :class="app.theme === 'dark' ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-brand-500/20' : 'bg-black hover:bg-gray-800 text-white shadow-black/20'">
        <Icon :name="player.isPlaying ? 'pause' : 'play'" class="text-lg" />
      </button>
      <button @click="player.nextSentence(transcript.sentences.length - 1)" class="text-lg transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black'">
        <Icon name="forward-step" />
      </button>
      <button @click="player.toggleLoop()" class="text-lg transition-colors relative"
              :class="player.isLooping ? 'text-brand-500' : (app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black')"
              title="Repeat Current">
        <Icon name="repeat" />
        <div v-if="player.isLooping" class="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500"></div>
      </button>
    </div>

    <!-- Right: Volume + Time -->
    <div class="flex items-center gap-4 text-xs font-mono text-gray-500 justify-self-end">
      <div class="flex items-center gap-2 group mr-2">
        <button @click="player.toggleMute()" class="w-5 focus:outline-none text-right" title="Mute/Unmute">
          <Icon :name="volumeIcon()" class="transition-colors text-sm" :class="app.theme === 'dark' ? 'text-gray-400 group-hover:text-white' : 'text-gray-400 group-hover:text-black'" />
        </button>
        <input type="range" min="0" max="100" v-model.number="player.volume" class="w-16 cursor-pointer">
      </div>
      <span>00:36 / 01:30</span>
      <span class="cursor-pointer transition-colors"
            :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black'">1x</span>
    </div>
  </div>
</template>

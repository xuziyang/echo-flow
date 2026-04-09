<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import Icon from '../Icon.vue'

const player = usePlayerStore()
const app = useAppStore()
const transcript = useTranscriptStore()
const isSeeking = ref(false)
const seekDraftMs = ref(0)
const seekDirty = ref(false)

const seekBarMax = computed(() => Math.max(0, player.durationMs || 0))
const displayedPositionMs = computed(() => (
  isSeeking.value ? seekDraftMs.value : player.positionMs
))

function clampSeekMs(ms: number) {
  const max = seekBarMax.value
  return Math.max(0, Math.min(ms, max))
}

function formatTime(ms: number): string {
  if (!ms || ms < 0) return '00:00'
  const totalSecs = Math.floor(ms / 1000)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function volumeIcon() {
  if (player.volume === 0) return 'volume-xmark'
  if (player.volume < 50) return 'volume-low'
  return 'volume-high'
}

function onSeekPointerDown() {
  if (seekBarMax.value <= 0) return
  isSeeking.value = true
  seekDraftMs.value = clampSeekMs(player.positionMs)
}

function onSeekInput(event: Event) {
  if (seekBarMax.value <= 0) return
  const target = event.target as HTMLInputElement
  const parsed = Number.parseInt(target.value, 10)
  if (!Number.isFinite(parsed)) return
  seekDraftMs.value = clampSeekMs(parsed)
  isSeeking.value = true
  seekDirty.value = true
}

async function commitSeek() {
  if (!seekDirty.value) {
    isSeeking.value = false
    return
  }
  seekDirty.value = false
  const targetMs = clampSeekMs(seekDraftMs.value)
  await player.seekTo(targetMs)
  isSeeking.value = false
}

watch(() => player.durationMs, (duration) => {
  if (duration <= 0) {
    isSeeking.value = false
    seekDraftMs.value = 0
    seekDirty.value = false
    return
  }
  seekDraftMs.value = clampSeekMs(seekDraftMs.value || player.positionMs)
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <input
      type="range"
      min="0"
      :max="seekBarMax"
      :value="displayedPositionMs"
      :disabled="seekBarMax <= 0"
      class="w-full h-1.5 rounded-lg cursor-pointer accent-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
      :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-gray-200'"
      @pointerdown="onSeekPointerDown"
      @input="onSeekInput"
      @change="commitSeek"
      @pointerup="commitSeek"
    />

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
        <span>{{ formatTime(displayedPositionMs) }} / {{ formatTime(player.durationMs) }}</span>
        <span class="cursor-pointer transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black'">1x</span>
      </div>
    </div>
  </div>
</template>

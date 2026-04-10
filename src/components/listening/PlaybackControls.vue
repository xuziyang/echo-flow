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
const seekPercent = computed(() => {
  if (seekBarMax.value <= 0) return 0
  return Math.max(0, Math.min(100, (displayedPositionMs.value / seekBarMax.value) * 100))
})

const seekTrackStyle = computed(() => ({
  '--seek-track-bg': app.theme === 'dark'
    ? `linear-gradient(to right, #f4f4f5 0%, #f4f4f5 ${seekPercent.value}%, #3f3f46 ${seekPercent.value}%, #3f3f46 100%)`
    : `linear-gradient(to right, #18181b 0%, #18181b ${seekPercent.value}%, #d4d4d8 ${seekPercent.value}%, #d4d4d8 100%)`
}))
const volumeTrackStyle = computed(() => ({
  '--volume-track-bg': app.theme === 'dark'
    ? `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${player.volume}%, #27272a ${player.volume}%, #27272a 100%)`
    : `linear-gradient(to right, #18181b 0%, #18181b ${player.volume}%, #d4d4d8 ${player.volume}%, #d4d4d8 100%)`
}))

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

function onSeekInput(event: Event) {
  if (seekBarMax.value <= 0) return
  const target = event.target as HTMLInputElement
  const parsed = Number.parseInt(target.value, 10)
  if (!Number.isFinite(parsed)) return
  seekDraftMs.value = clampSeekMs(parsed)
  isSeeking.value = true
  seekDirty.value = true
}

function onVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const parsed = Number.parseInt(target.value, 10)
  if (!Number.isFinite(parsed)) return
  void player.setVolume(Math.max(0, Math.min(parsed, 100)))
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
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <span class="text-[11px] font-mono tabular-nums"
            :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
        {{ formatTime(displayedPositionMs) }}
      </span>

      <input
        type="range"
        min="0"
        :max="seekBarMax"
        :value="displayedPositionMs"
        :disabled="seekBarMax <= 0"
        class="seek-slider w-full h-1 rounded-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        @input="onSeekInput"
        @change="commitSeek"
        :style="seekTrackStyle"
      />

      <span class="text-[11px] font-mono tabular-nums"
            :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
        {{ formatTime(player.durationMs) }}
      </span>
    </div>

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

    <!-- Right: Volume -->
      <div class="flex items-center gap-3 justify-self-end">
        <div
          class="relative flex h-5 items-center justify-center gap-2 group"
        >
          <button
            @click="player.toggleMute()"
            class="w-5 h-5 focus:outline-none flex items-center justify-center rounded-full transition-colors"
            :class="app.theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-black'"
            title="Mute/Unmute"
          >
            <Icon :name="volumeIcon()" class="text-sm" />
          </button>
          <div
            class="flex items-center h-5 overflow-hidden w-0 opacity-0 pointer-events-none transition-all duration-200 group-hover:w-24 group-hover:opacity-100 group-hover:pointer-events-auto"
          >
            <input
              type="range"
              min="0"
              max="100"
              :value="player.volume"
              class="volume-slider w-full h-5 cursor-pointer"
              :style="volumeTrackStyle"
              @input="onVolumeInput"
            >
          </div>
          <span
            class="overflow-hidden w-0 opacity-0 pointer-events-none transition-all duration-200 group-hover:w-[30px] group-hover:opacity-100 group-hover:pointer-events-auto text-[11px] font-mono tabular-nums leading-none text-right"
            :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'"
          >
            {{ player.volume }}%
          </span>
        </div>
        <span class="cursor-pointer transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'">1x</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seek-slider {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  border: 0;
}

.seek-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: var(--seek-track-bg);
}

.seek-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.18);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
  margin-top: -3px;
}

.seek-slider::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: transparent;
}

.seek-slider::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: transparent;
}

.seek-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.18);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}

.volume-slider {
  -webkit-appearance: none;
  appearance: none;
  display: block;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.volume-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: var(--volume-track-bg);
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 0;
  height: 0;
  border-radius: 999px;
  background: transparent;
  border: 0;
  box-shadow: none;
  margin-top: 0;
  opacity: 0;
  transition: all 0.16s ease;
}

.volume-slider::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: transparent;
}

.volume-slider::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: transparent;
}

.volume-slider::-moz-range-thumb {
  width: 0;
  height: 0;
  border-radius: 999px;
  background: transparent;
  border: 0;
  box-shadow: none;
  opacity: 0;
  transition: all 0.16s ease;
}

.group:hover .volume-slider::-webkit-slider-thumb,
.volume-slider:focus-visible::-webkit-slider-thumb {
  width: 9px;
  height: 9px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  margin-top: -2px;
  opacity: 1;
}

.group:hover .volume-slider::-moz-range-thumb,
.volume-slider:focus-visible::-moz-range-thumb {
  width: 9px;
  height: 9px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  opacity: 1;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import Icon from '../Icon.vue'

const player = usePlayerStore()
const app = useAppStore()
const transcript = useTranscriptStore()
const volumeTrackStyle = computed(() => ({
  '--volume-track-bg': app.theme === 'dark'
    ? `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${player.volume}%, #27272a ${player.volume}%, #27272a 100%)`
    : `linear-gradient(to right, #18181b 0%, #18181b ${player.volume}%, #d4d4d8 ${player.volume}%, #d4d4d8 100%)`
}))

function volumeIcon() {
  if (player.volume === 0) return 'volume-xmark'
  if (player.volume < 50) return 'volume-low'
  return 'volume-high'
}

function onVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const parsed = Number.parseInt(target.value, 10)
  if (!Number.isFinite(parsed)) return
  void player.setVolume(Math.max(0, Math.min(parsed, 100)))
}
</script>

<template>
  <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
    <div />

    <div class="flex items-center gap-1.5 rounded-2xl border px-1.5 py-1 justify-self-center"
         :class="app.theme === 'dark'
           ? 'border-white/10 bg-black/20'
           : 'border-black/10 bg-white/80'">
      <button @click="player.prevSentence()"
              class="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
              :class="app.theme === 'dark'
                ? 'text-gray-300 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'">
        <Icon name="backward-step" :size="15" />
      </button>

      <button @click="player.togglePlay()"
              class="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg hover:scale-[1.03] transition-all"
              :class="app.theme === 'dark'
                ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/25'
                : 'bg-black hover:bg-gray-800 text-white shadow-black/20'">
        <Icon :name="player.isPlaying ? 'pause' : 'play'" :size="15" />
      </button>

      <button @click="player.nextSentence(transcript.sentences.length - 1)"
              class="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
              :class="app.theme === 'dark'
                ? 'text-gray-300 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'">
        <Icon name="forward-step" :size="15" />
      </button>

      <button @click="player.toggleLoop()"
              class="h-8 w-8 rounded-lg flex items-center justify-center transition-colors relative"
              :class="player.isLooping
                ? 'text-sky-500 bg-sky-500/10'
                : (app.theme === 'dark'
                  ? 'text-gray-300 hover:text-white hover:bg-white/10'
                  : 'text-gray-600 hover:text-black hover:bg-black/[0.06]')"
              title="Repeat Current">
        <Icon name="repeat" :size="15" />
        <div v-if="player.isLooping"
             class="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-sky-500" />
      </button>
    </div>

    <div class="flex items-center gap-2 justify-self-end">
      <div class="hidden sm:flex items-center gap-1.5 rounded-full px-2 py-1 border"
           :class="app.theme === 'dark'
             ? 'border-white/10 bg-black/20'
             : 'border-black/10 bg-white/80'">
        <button
          @click="player.toggleMute()"
          class="w-5 h-5 focus:outline-none flex items-center justify-center rounded-full transition-colors"
          :class="app.theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-black'"
          title="Mute/Unmute"
        >
          <Icon :name="volumeIcon()" class="text-sm" />
        </button>

        <input
          type="range"
          min="0"
          max="100"
          :value="player.volume"
          class="volume-slider w-16 h-5 cursor-pointer"
          :style="volumeTrackStyle"
          @input="onVolumeInput"
        >

        <span class="text-[10px] font-mono tabular-nums leading-none text-right min-w-[28px]"
              :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
          {{ player.volume }}%
        </span>
      </div>

      <button type="button"
              class="h-7 px-2 rounded-full text-[10px] font-semibold tracking-wide border transition-colors"
              :class="app.theme === 'dark'
                ? 'border-white/10 bg-black/20 text-gray-300 hover:text-white hover:bg-white/10'
                : 'border-black/10 bg-white/80 text-gray-600 hover:text-black hover:bg-black/[0.06]'"
              title="Playback speed">
        1x
      </button>
    </div>
  </div>
</template>

<style scoped>
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
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  margin-top: -2px;
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
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
}
</style>

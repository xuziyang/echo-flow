<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import Icon from '../Icon.vue'

const player = usePlayerStore()
const app = useAppStore()
const transcript = useTranscriptStore()

const seekBarMax = computed(() => Math.max(0, player.durationMs || 0))
const progress = computed(() =>
  seekBarMax.value > 0 ? player.positionMs / seekBarMax.value : 0
)
const seekPercent = computed(() => `${Math.round(progress.value * 100)}%`)
const seekTrackStyle = computed(() => ({
  '--seek-track-bg': app.theme === 'dark'
    ? `linear-gradient(to right, #f4f4f5 0%, #f4f4f5 ${seekPercent.value}, #3f3f46 ${seekPercent.value}, #3f3f46 100%)`
    : `linear-gradient(to right, #18181b 0%, #18181b ${seekPercent.value}, #d4d4d8 ${seekPercent.value}, #d4d4d8 100%)`,
}))

const volumeTrackStyle = computed(() => ({
  '--volume-track-bg': app.theme === 'dark'
    ? `linear-gradient(to right, #d4d4d8 0%, #d4d4d8 ${player.volume}%, #27272a ${player.volume}%, #27272a 100%)`
    : `linear-gradient(to right, #18181b 0%, #18181b ${player.volume}%, #d4d4d8 ${player.volume}%, #d4d4d8 100%)`,
}))

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
  void player.seekTo(parsed)
}

function onVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const parsed = Number.parseInt(target.value, 10)
  if (!Number.isFinite(parsed)) return
  void player.setVolume(Math.max(0, Math.min(parsed, 100)))
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-3">
      <span class="text-[10px] font-mono tabular-nums min-w-[36px] text-right"
            :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
        {{ formatTime(player.positionMs) }}
      </span>
      <input
        type="range"
        min="0"
        :max="seekBarMax"
        :value="player.positionMs"
        :disabled="seekBarMax <= 0"
        class="seek-slider h-5 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        :style="seekTrackStyle"
        @input="onSeekInput"
      />
      <span class="text-[10px] font-mono tabular-nums min-w-[36px]"
            :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
        {{ formatTime(player.durationMs) }}
      </span>
    </div>

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
  </div>
</template>

<style scoped>
.seek-slider {
  -webkit-appearance: none;
  appearance: none;
  display: block;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 999px;
}

.seek-slider::-webkit-slider-runnable-track {
  height: 3px;
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
  border: 1px solid rgba(24, 24, 27, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  margin-top: -3.5px;
}

.seek-slider::-moz-range-track {
  height: 3px;
  border-radius: 999px;
  background: transparent;
}

.seek-slider::-moz-range-progress {
  height: 3px;
  border-radius: 999px;
  background: transparent;
}

.seek-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
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

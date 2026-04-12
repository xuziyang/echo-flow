<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useWaveform } from '../../composables/useWaveform'

const props = withDefaults(defineProps<{
  showSeekOverlay?: boolean
  showTimeLabels?: boolean
}>(), {
  showSeekOverlay: true,
  showTimeLabels: true,
})

const emit = defineEmits<{
  (e: 'seek-input', value: number): void
  (e: 'seek-commit', value: number): void
}>()

const app = useAppStore()
const player = usePlayerStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isSeeking = ref(false)
const seekDraftMs = ref(0)
const seekDirty = ref(false)

const seekBarMax = computed(() => Math.max(0, player.durationMs || 0))
const displayedPositionMs = computed(() => (
  isSeeking.value ? seekDraftMs.value : player.positionMs
))

const progress = computed(() =>
  seekBarMax.value > 0 ? displayedPositionMs.value / seekBarMax.value : 0
)
const seekPercent = computed(() => `${Math.round(progress.value * 100)}%`)
const seekTrackStyle = computed(() => ({
  '--seek-track-bg': app.theme === 'dark'
    ? `linear-gradient(to right, #f4f4f5 0%, #f4f4f5 ${seekPercent.value}, #3f3f46 ${seekPercent.value}, #3f3f46 100%)`
    : `linear-gradient(to right, #18181b 0%, #18181b ${seekPercent.value}, #d4d4d8 ${seekPercent.value}, #d4d4d8 100%)`,
}))

const colors = computed(() => ({
  activeColor: app.theme === 'dark' ? '#5e93c4' : '#4f88b8',
  inactiveColor: app.theme === 'dark' ? 'rgba(96,140,182,0.45)' : 'rgba(79,136,184,0.55)',
  playedColor: app.theme === 'dark' ? '#76abd8' : '#5f99c7',
  backgroundColor: app.theme === 'dark' ? '#191d22' : '#ececec',
  centerLineColor: app.theme === 'dark' ? 'rgba(158,171,186,0.48)' : 'rgba(108,117,127,0.45)',
}))

useWaveform(canvasRef, {
  samples: computed(() => player.waveformSamples),
  isPlaying: computed(() => player.isPlaying),
  progress,
  activeColor: computed(() => colors.value.activeColor),
  inactiveColor: computed(() => colors.value.inactiveColor),
  playedColor: computed(() => colors.value.playedColor),
  backgroundColor: computed(() => colors.value.backgroundColor),
  centerLineColor: computed(() => colors.value.centerLineColor),
})

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

function onSeekInput(event: Event) {
  if (seekBarMax.value <= 0) return
  const target = event.target as HTMLInputElement
  const parsed = Number.parseInt(target.value, 10)
  if (!Number.isFinite(parsed)) return
  seekDraftMs.value = clampSeekMs(parsed)
  isSeeking.value = true
  seekDirty.value = true
  emit('seek-input', seekDraftMs.value)
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
  emit('seek-commit', targetMs)
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
  <div class="h-24 relative rounded-xl border overflow-visible"
       :class="app.theme === 'dark'
         ? 'border-white/10 bg-gradient-to-b from-[#1d232a] to-[#151a20]'
         : 'border-black/10 bg-gradient-to-b from-[#f7fbff] to-[#ecf1f6]'">
    <div class="absolute inset-0 rounded-[inherit] overflow-hidden">
      <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />

      <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent" />

      <div class="pointer-events-none absolute inset-x-3 top-1.5 flex items-center justify-between text-[9px] font-medium tracking-wide"
           :class="app.theme === 'dark' ? 'text-gray-400/90' : 'text-gray-600/90'">
        <span>Waveform</span>
        <span>{{ seekPercent }}</span>
      </div>

      <div v-if="props.showTimeLabels"
           class="pointer-events-none absolute inset-x-3 bottom-4 flex items-center justify-between text-[10px] font-mono tabular-nums"
           :class="app.theme === 'dark' ? 'text-gray-300/95' : 'text-gray-700/95'">
        <span>{{ formatTime(displayedPositionMs) }}</span>
        <span>{{ formatTime(player.durationMs) }}</span>
      </div>
    </div>

    <div v-if="props.showSeekOverlay"
         class="absolute inset-x-3 bottom-[-7px] h-4 flex items-end">
      <input
        type="range"
        min="0"
        :max="seekBarMax"
        :value="displayedPositionMs"
        :disabled="seekBarMax <= 0"
        class="seek-slider h-4 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
        :style="seekTrackStyle"
        @input="onSeekInput"
        @change="commitSeek"
      />
    </div>
  </div>
</template>

<style scoped>
.seek-slider {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
}

.seek-slider::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 999px;
  background: var(--seek-track-bg);
}

.seek-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.18);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  margin-top: -3px;
}

.seek-slider::-moz-range-track {
  height: 2px;
  border-radius: 999px;
  background: transparent;
}

.seek-slider::-moz-range-progress {
  height: 2px;
  border-radius: 999px;
  background: transparent;
}

.seek-slider::-moz-range-thumb {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(24, 24, 27, 0.18);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
</style>

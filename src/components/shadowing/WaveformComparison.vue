<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import OriginalWaveform from './OriginalWaveform.vue'
import UserWaveform from './UserWaveform.vue'
import Icon from '../Icon.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const transcript = useTranscriptStore()

const currentSentence = computed(() => transcript.sentences[player.currentIndex])
const isBusy = computed(() => (
  player.isPlaying
  || player.seeking
  || recording.isRecording
  || Boolean(recording.activePlaybackMode)
))
const canPlayOriginal = computed(() => (
  !isBusy.value
  && player.canPlaySentenceSegment(currentSentence.value?.start_ms, currentSentence.value?.end_ms)
))

const hasRecording = computed(() => Boolean(recording.userAudioUrl))
const canToggleRecording = computed(() => recording.isRecording || !isBusy.value)
const canPlayRecording = computed(() => hasRecording.value && !isBusy.value)
const canCompare = computed(() => (
  hasRecording.value
  && !isBusy.value
  && player.canPlaySentenceSegment(currentSentence.value?.start_ms, currentSentence.value?.end_ms)
))

const isDark = computed(() => app.theme === 'dark')

const actionButtonClass = (enabled: boolean) => {
  if (isDark.value) {
    return enabled
      ? 'border-white/10 text-gray-200 hover:bg-white/5 hover:border-white/20 hover:scale-[1.03]'
      : 'border-white/5 text-gray-500 opacity-40 cursor-not-allowed'
  }
  return enabled
    ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:scale-[1.03] shadow-sm'
    : 'border-gray-100 text-gray-400 bg-gray-50 opacity-50 cursor-not-allowed'
}
</script>

<template>
  <div class="flex-1 flex flex-col relative min-h-0">
    <OriginalWaveform />
    <UserWaveform />

    <!-- Bottom Control Bar -->
    <div class="border-t flex items-center justify-center gap-3 px-6 py-4 flex-shrink-0 transition-colors"
         :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">

      <!-- Play Original -->
      <button
        @click="void player.playSentenceSegment(currentSentence?.start_ms, currentSentence?.end_ms)"
        class="h-10 px-4 text-sm font-medium rounded-xl border flex items-center gap-2 transition-all duration-200"
        :class="actionButtonClass(canPlayOriginal)"
        :disabled="!canPlayOriginal"
        title="Enter — Play current sentence">
        <Icon name="play" :size="15" />
        Original
      </button>

      <!-- Recording Button -->
      <button @click="recording.toggleRecording()"
              :disabled="!canToggleRecording"
              class="w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-200 shadow-lg mx-3"
              :class="!canToggleRecording
                ? (app.theme === 'dark'
                  ? 'bg-zinc-800 text-zinc-500 shadow-none cursor-not-allowed opacity-45'
                  : 'bg-gray-100 text-gray-400 shadow-none cursor-not-allowed opacity-55')
                : ((recording.isRecording ? 'recording-ring ' : '') +
                  (recording.isRecording
                    ? 'bg-red-500 text-white shadow-red-500/25 hover:bg-red-600 hover:scale-110'
                    : (app.theme === 'dark'
                       ? 'bg-sky-500 text-white shadow-sky-500/25 hover:bg-sky-400 hover:scale-110'
                       : 'bg-sky-500 text-white shadow-sky-500/20 hover:bg-sky-600 hover:scale-110')))"
              title="Space — Start/stop recording">
        <Icon :name="recording.isRecording ? 'stop' : 'microphone'" />
      </button>

      <!-- Play Recording -->
      <button @click="void recording.playUserRecording()"
              class="h-10 px-4 text-sm font-medium rounded-xl border flex items-center gap-2 transition-all duration-200"
              :class="actionButtonClass(canPlayRecording)"
              :disabled="!canPlayRecording"
              title="R — Play your latest recording">
        <Icon name="play" :size="15" />
        Recording
      </button>

      <!-- Contrast -->
      <button @click="void recording.playComparison()"
              class="h-10 px-4 text-sm font-medium rounded-xl border flex items-center gap-2 transition-all duration-200"
              :class="actionButtonClass(canCompare)"
              :disabled="!canCompare"
              title="C — Play original then recording">
        <Icon name="code-compare" :size="15" />
        Contrast
      </button>
    </div>
  </div>
</template>

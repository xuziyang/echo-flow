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
  || Boolean(recording.activeLoopMode)
))
const canPlayOriginal = computed(() => (
  recording.activeLoopMode === 'original'
  || (!isBusy.value
  && player.canPlaySentenceSegment(currentSentence.value?.start_ms, currentSentence.value?.end_ms)
  )
))

const canToggleRecording = computed(() => (
  recording.isRecording
  || recording.activeLoopMode !== null
  || !isBusy.value
))
const canPlayRecording = computed(() => recording.hasRecording && !isBusy.value)
const canCompare = computed(() => (
  recording.activeLoopMode === 'comparison'
  || (recording.hasRecording
    && !isBusy.value
    && player.canPlaySentenceSegment(currentSentence.value?.start_ms, currentSentence.value?.end_ms)
  )
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

const loopButtonClass = computed(() => {
  const active = recording.loopEnabled
  if (isDark.value) {
    return active
      ? 'border-sky-500/40 bg-sky-500/15 text-sky-200 shadow-sky-500/10'
      : 'border-white/10 text-gray-300 hover:text-white hover:bg-white/5 hover:border-white/20'
  }
  return active
    ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
})

const autoRecordButtonClass = computed(() => {
  const active = recording.autoRecordEnabled
  if (isDark.value) {
    return active
      ? 'border-red-500/40 bg-red-500/10 text-red-200 shadow-red-500/10'
      : 'border-white/10 text-gray-300 hover:text-white hover:bg-white/5 hover:border-white/20'
  }
  return active
    ? 'border-red-200 bg-red-50 text-red-700 shadow-sm'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
})

const actionButtonClassWithActive = (enabled: boolean, active: boolean) => {
  if (active) {
    return isDark.value
      ? 'border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:scale-[1.03]'
      : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:scale-[1.03] shadow-sm'
  }
  return actionButtonClass(enabled)
}
</script>

<template>
  <div class="flex-1 flex flex-col relative min-h-0">
    <OriginalWaveform />
    <UserWaveform />

    <!-- Bottom Control Bar -->
    <div class="border-t flex flex-col items-center justify-center gap-2.5 px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0 transition-colors"
         :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">

      <div class="flex items-center justify-center gap-2">
        <!-- Loop Toggle -->
        <button
          type="button"
          class="h-8 px-2.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all duration-200"
          :class="loopButtonClass"
          :title="recording.loopEnabled ? 'Loop is on' : 'Loop is off'"
          @click="recording.toggleLoopEnabled()">
          <Icon name="repeat" :size="13" />
          Loop
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="recording.loopEnabled ? 'bg-sky-500' : (app.theme === 'dark' ? 'bg-zinc-600' : 'bg-gray-300')"
          />
        </button>

        <!-- Auto Record Toggle -->
        <button
          type="button"
          class="h-8 px-2.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all duration-200"
          :class="autoRecordButtonClass"
          :title="recording.autoRecordEnabled ? 'Auto recording after original is on' : 'Auto recording after original is off'"
          @click="recording.toggleAutoRecordEnabled()">
          <Icon name="microphone" :size="13" />
          Auto Rec
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="recording.autoRecordEnabled ? 'bg-red-500' : (app.theme === 'dark' ? 'bg-zinc-600' : 'bg-gray-300')"
          />
        </button>
      </div>

      <div class="grid grid-cols-[minmax(96px,1fr)_56px] sm:grid-cols-[minmax(92px,112px)_56px_minmax(92px,112px)_minmax(104px,120px)] items-center justify-center gap-2 sm:gap-3 w-full max-w-[520px] sm:w-auto sm:max-w-none">
        <!-- Play Original -->
        <button
          @click="void recording.playOriginal()"
          class="h-10 w-full px-3 text-sm font-medium rounded-xl border flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-200"
          :class="actionButtonClassWithActive(canPlayOriginal, recording.activeLoopMode === 'original')"
          :disabled="!canPlayOriginal"
          title="Space — Play current sentence">
          <Icon :name="recording.activeLoopMode === 'original' ? 'stop' : 'play'" :size="15" />
          {{ recording.activeLoopMode === 'original' ? 'Stop' : 'Original' }}
        </button>

        <!-- Recording Button -->
        <button @click="recording.toggleRecording()"
                :disabled="!canToggleRecording"
                class="w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all duration-200 shadow-lg justify-self-center"
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
                title="R — Start/stop recording">
          <Icon :name="recording.isRecording ? 'stop' : 'microphone'" />
        </button>

        <!-- Replay Recording -->
        <button @click="void recording.playUserRecording()"
                class="h-10 w-full px-3 text-sm font-medium rounded-xl border flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-200"
                :class="actionButtonClass(canPlayRecording)"
                :disabled="!canPlayRecording"
                title="Play your latest recording">
          <Icon name="play" :size="15" />
          Replay
        </button>

        <!-- Contrast -->
        <button @click="void recording.playComparison()"
                class="h-10 w-full px-3 text-sm font-medium rounded-xl border flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-200"
                :class="actionButtonClassWithActive(canCompare, recording.activeLoopMode === 'comparison')"
                :disabled="!canCompare"
                title="C — Play original then recording">
          <Icon :name="recording.activeLoopMode === 'comparison' ? 'stop' : 'code-compare'" :size="15" />
          {{ recording.activeLoopMode === 'comparison' ? 'Stop' : 'Contrast' }}
        </button>
      </div>
    </div>
  </div>
</template>

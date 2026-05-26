<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import ShadowingWorkArea from './ShadowingWorkArea.vue'
import ShadowingScriptFlow from './ShadowingScriptFlow.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const transcript = useTranscriptStore()

const isBusy = computed(() => (
  player.isPlaying
  || player.seeking
  || recording.isRecording
  || Boolean(recording.activePlaybackMode)
))

function playCurrentSentence() {
  if (isBusy.value) return
  const s = transcript.sentences[player.currentIndex]
  void player.playSentenceSegment(s?.start_ms, s?.end_ms)
}

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault()
      if (isBusy.value) return
      player.prevSentence()
      break
    case 'ArrowRight':
      e.preventDefault()
      if (isBusy.value) return
      player.nextSentence(transcript.sentences.length - 1)
      break
    case 'Enter':
      e.preventDefault()
      if (isBusy.value) return
      void player.playSentenceSegment(
        transcript.sentences[player.currentIndex]?.start_ms,
        transcript.sentences[player.currentIndex]?.end_ms,
      )
      break
    case 'Space':
      e.preventDefault()
      if (isBusy.value && !recording.isRecording) return
      void recording.toggleRecording()
      break
    case 'KeyR':
      if (isBusy.value) return
      void recording.playUserRecording()
      break
    case 'KeyC':
      if (isBusy.value) return
      void recording.playComparison()
      break
    case 'Escape':
      app.switchMode('listening')
      break
  }
}

onMounted(() => {
  void player.clearSentenceSegment({ pausePlayback: true })
  window.addEventListener('keydown', onKeydown)
})

watch(() => player.currentIndex, () => {
  playCurrentSentence()
})

onUnmounted(() => {
  void player.clearSentenceSegment({ pausePlayback: true })
  recording.stopPlayback()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="flex-1 flex flex-col lg:flex-row overflow-hidden"
       :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-light-bg'">
    <ShadowingWorkArea />
    <ShadowingScriptFlow />
  </div>
</template>

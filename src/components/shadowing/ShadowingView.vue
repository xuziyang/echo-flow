<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
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

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault()
      player.prevSentence()
      break
    case 'ArrowRight':
      e.preventDefault()
      player.nextSentence(transcript.sentences.length - 1)
      break
    case 'Enter':
      e.preventDefault()
      void player.playSentenceSegment(
        transcript.sentences[player.currentIndex]?.start_ms,
        transcript.sentences[player.currentIndex]?.end_ms,
      )
      break
    case 'Space':
      e.preventDefault()
      void recording.toggleRecording()
      break
    case 'KeyR':
      void recording.playUserRecording()
      break
    case 'KeyC':
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

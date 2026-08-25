<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import ShadowingWorkArea from './ShadowingWorkArea.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const transcript = useTranscriptStore()
let sentenceSwitchToken = 0

const isBusy = computed(() => (
  player.isPlaying
  || player.seeking
  || recording.isRecording
  || Boolean(recording.activePlaybackMode)
  || Boolean(recording.activeLoopMode)
))

function playSentenceAtIndex(index: number) {
  if (isBusy.value) return
  const s = transcript.sentences[index]
  void player.playSentenceSegment(s?.start_ms, s?.end_ms)
}

function onKeydown(e: KeyboardEvent) {
  if (app.isSettingsOpen) return
  // 任意模态（确认 / 重生成对话框）打开时不响应快捷键
  if (document.querySelector('.overlay')) return
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
    case 'Space':
      e.preventDefault()
      if (recording.activeLoopMode || recording.comparisonActive) {
        void recording.stopPlayback()
        return
      }
      if (isBusy.value) return
      void recording.playOriginal()
      break
    case 'KeyR':
      e.preventDefault()
      if (isBusy.value && !recording.isRecording) return
      void recording.toggleRecording()
      break
    case 'KeyC':
      e.preventDefault()
      if (recording.comparisonActive || recording.activeLoopMode === 'comparison') {
        void recording.stopPlayback()
        return
      }
      if (isBusy.value) return
      void recording.playComparison()
      break
    case 'Escape':
      if (recording.activeLoopMode || recording.comparisonActive) {
        void recording.stopPlayback()
        return
      }
      app.switchMode('listening')
      break
  }
}

onMounted(() => {
  void player.clearSentenceSegment({ pausePlayback: true })
  window.addEventListener('keydown', onKeydown)
})

watch(() => player.currentIndex, async (index) => {
  const currentSwitchToken = ++sentenceSwitchToken
  await recording.stopPlayback()
  if (currentSwitchToken !== sentenceSwitchToken) {
    return
  }
  playSentenceAtIndex(index)
})

onUnmounted(() => {
  void player.clearSentenceSegment({ pausePlayback: true })
  recording.stopPlayback()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <ShadowingWorkArea />
</template>

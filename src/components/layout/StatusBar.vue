<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useFilesStore } from '../../stores/useFilesStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'

const app = useAppStore()
const files = useFilesStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const transcript = useTranscriptStore()

const statusLabel = computed(() => {
  if (transcript.isTranscribing) return `正在生成字幕 ${Math.round(transcript.transcribeProgress)}%`
  if (transcript.transcribeError && !transcript.sentences.length) return '字幕生成失败'
  if (!player.currentPath) return '就绪'
  if (app.mode === 'listening') {
    return player.isPlaying ? '播放中' : (player.positionMs > 0 ? '已暂停' : '就绪')
  }
  if (recording.isRecording) return '录音中'
  if (recording.activeLoopMode) return recording.activeLoopMode === 'original' ? '原音循环中' : '对照循环中'
  return '跟读练习'
})

const hints = computed(() => (
  app.mode === 'listening'
    ? 'Space 播放/暂停 · H 遮蔽文本'
    : 'Space 原音 · R 录音 · C 对照 · ← → 切句 · Esc 返回'
))
</script>

<template>
  <footer class="statusbar">
    <span>{{ files.currentFile?.title ?? '未打开文件' }}</span>
    <span class="sep">·</span>
    <span>{{ statusLabel }}</span>
    <template v-if="transcript.sentences.length">
      <span class="sep">·</span>
      <span>第 {{ player.currentIndex + 1 }} / {{ transcript.sentences.length }} 句</span>
    </template>
    <span class="spacer"></span>
    <span>{{ hints }}</span>
  </footer>
</template>

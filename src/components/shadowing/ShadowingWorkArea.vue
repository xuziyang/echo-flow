<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
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
const sentenceCount = computed(() => transcript.sentences.length)

const isBusy = computed(() => (
  player.isPlaying
  || player.seeking
  || recording.isRecording
  || Boolean(recording.activePlaybackMode)
  || Boolean(recording.activeLoopMode)
))

const canPlayOriginal = computed(() => (
  !isBusy.value
  && player.canPlaySentenceSegment(currentSentence.value?.start_ms, currentSentence.value?.end_ms)
))
const canToggleRecording = computed(() => (
  recording.isRecording
  || recording.activeLoopMode !== null
  || !isBusy.value
))
const canPlayRecording = computed(() => recording.hasRecording && !isBusy.value)
const canCompare = computed(() => (
  recording.hasRecording
  && !isBusy.value
  && player.canPlaySentenceSegment(currentSentence.value?.start_ms, currentSentence.value?.end_ms)
))

/* 对照播放的舞台调度：原音亮、我的暗，然后交换 */
const cmpStep = computed(() => {
  if (recording.activePlaybackMode === 'comparison') return 2
  if (recording.comparisonActive) return 1
  return 0
})

/* 对照第一阶段也会 isPlaying，原音高亮需排除对照 */
const originalActive = computed(() => (
  (player.isPlaying || recording.activeLoopMode === 'original') && !recording.comparisonActive
))
const playbackActive = computed(() => recording.activePlaybackMode === 'recording')
const compareActive = computed(() => (
  recording.comparisonActive
  || recording.activePlaybackMode === 'comparison'
  || recording.activeLoopMode === 'comparison'
))
const originalEnabled = computed(() => canPlayOriginal.value || originalActive.value || compareActive.value)
const playbackEnabled = computed(() => canPlayRecording.value || playbackActive.value)
const compareEnabled = computed(() => canCompare.value || compareActive.value)

/* 录音计时 */
const recElapsed = ref(0)
let recTimer: ReturnType<typeof setInterval> | null = null
watch(() => recording.isRecording, (isRecording) => {
  if (recTimer) { clearInterval(recTimer); recTimer = null }
  if (isRecording) {
    recElapsed.value = 0
    recTimer = setInterval(() => { recElapsed.value += 0.1 }, 100)
  }
})
function formatRecTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const t = Math.floor((s % 1) * 10)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${t}`
}

function gotoSentence(delta: number) {
  if (isBusy.value) return
  const next = player.currentIndex + delta
  if (next < 0 || next >= sentenceCount.value) return
  player.setCurrentIndex(next)
}

function stopOrStart(isActive: boolean, start: () => Promise<unknown>) {
  if (isActive) {
    void recording.stopPlayback()
    return
  }
  void start()
}

function onPlayOriginal() {
  stopOrStart(originalActive.value || compareActive.value, () => recording.playOriginal())
}

function onPlayRecording() {
  stopOrStart(playbackActive.value, () => recording.playUserRecording())
}

function onCompare() {
  stopOrStart(compareActive.value, () => recording.playComparison())
}

onUnmounted(() => {
  if (recTimer) clearInterval(recTimer)
})
</script>

<template>
  <div class="view animate-fade-in">
    <div class="sh-nav">
      <button class="nav-btn" :disabled="player.currentIndex === 0" @click="gotoSentence(-1)">
        <Icon name="chevron-left" :size="14" :stroke-width="1.8" /> 上一句 <kbd>←</kbd>
      </button>
      <span class="idx">第 {{ sentenceCount ? player.currentIndex + 1 : 0 }} / {{ sentenceCount }} 句</span>
      <button class="nav-btn" :disabled="player.currentIndex >= sentenceCount - 1" @click="gotoSentence(1)">
        下一句 <Icon name="chevron-right" :size="14" :stroke-width="1.8" /> <kbd>→</kbd>
      </button>
    </div>

    <div class="sh-center">
      <div class="sentence-big">
        <template v-if="currentSentence?.en">“{{ currentSentence.en }}”</template>
        <template v-else-if="transcript.isTranscribing">正在生成字幕…</template>
        <template v-else>暂无字幕</template>
      </div>

      <div class="sh-waves">
        <div class="wcell" :class="{ live: cmpStep === 1, dim: cmpStep === 2 }">
          <div class="wave-label"><span class="chip" style="background: var(--accent)"></span>原音</div>
          <OriginalWaveform />
        </div>
        <div class="wcell mine-cell" :class="{ live: cmpStep === 2, dim: cmpStep === 1 }">
          <div class="wave-label"><span class="chip" style="background: var(--mine)"></span>我的录音</div>
          <UserWaveform />
        </div>
      </div>

      <div class="rec-status" :class="{ on: recording.isRecording }">
        <span class="rdot"></span>正在录音 {{ formatRecTime(recElapsed) }}
      </div>
      <div class="cmp-status" :class="{ on: cmpStep > 0 }">
        对照播放 <b :class="{ on: cmpStep === 1 }">① 原音</b><span style="opacity: .45">→</span><b :class="{ 'on-mine': cmpStep === 2 }">② 我的录音</b>
      </div>
    </div>

    <div class="ctl-bar" :class="{ recording: recording.isRecording }">
      <button
        class="ctl"
        :class="{ 'loop-on': originalActive }"
        :disabled="!originalEnabled"
        @click="onPlayOriginal"
      >
        <Icon name="play" :size="15" :stroke-width="1.8" />
        原音 <kbd>Space</kbd>
      </button>
      <button
        class="ctl"
        :class="{ 'rec-on': recording.isRecording }"
        :disabled="!canToggleRecording"
        @click="recording.toggleRecording()"
      >
        <Icon :name="recording.isRecording ? 'stop' : 'microphone'" :size="15" :stroke-width="1.8" />
        {{ recording.isRecording ? '停录' : '录音' }} <kbd>R</kbd>
      </button>
      <button
        class="ctl"
        :class="{ 'mine-on': playbackActive }"
        :disabled="!playbackEnabled"
        @click="onPlayRecording"
      >
        <Icon name="rotate-left" :size="15" :stroke-width="1.8" /> 回放 <kbd>P</kbd>
      </button>
      <button
        class="ctl"
        :class="{ 'loop-on': compareActive }"
        :disabled="!compareEnabled"
        @click="onCompare"
      >
        <Icon name="code-compare" :size="15" :stroke-width="1.8" />
        对照 <kbd>C</kbd>
      </button>
      <label class="chk">
        <input type="checkbox" v-model="recording.autoRecordEnabled">播完自动录
      </label>
    </div>

    <button class="back-link" @click="app.switchMode('listening')">
      <Icon name="arrow-left" :size="14" :stroke-width="1.8" /> 返回听力
    </button>
  </div>
</template>

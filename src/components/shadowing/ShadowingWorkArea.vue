<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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

/* 循环菜单 */
const loopMenuOpen = ref(false)
function onLoopButtonClick() {
  if (recording.activeLoopMode) {
    void recording.stopPlayback()
    return
  }
  loopMenuOpen.value = !loopMenuOpen.value
}
function startLoop(mode: 'original' | 'comparison') {
  loopMenuOpen.value = false
  if (mode === 'original') void recording.toggleOriginalLoop()
  else void recording.toggleComparisonLoop()
}
function onDocumentClick() {
  loopMenuOpen.value = false
}

function gotoSentence(delta: number) {
  if (isBusy.value) return
  const next = player.currentIndex + delta
  if (next < 0 || next >= sentenceCount.value) return
  player.setCurrentIndex(next)
}

function onPlayOriginal() {
  if (recording.activeLoopMode || recording.comparisonActive) {
    void recording.stopPlayback()
    return
  }
  void recording.playOriginal()
}

function onCompare() {
  if (recording.comparisonActive || recording.activeLoopMode === 'comparison') {
    void recording.stopPlayback()
    return
  }
  void recording.playComparison()
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
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
        :disabled="!canPlayOriginal && !recording.activeLoopMode && !recording.comparisonActive"
        @click="onPlayOriginal"
      >
        <Icon :name="recording.activeLoopMode === 'original' ? 'stop' : 'play'" :size="15" :stroke-width="1.8" />
        {{ recording.activeLoopMode === 'original' ? '停止' : '原音' }} <kbd>Space</kbd>
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
      <button class="ctl" :disabled="!canPlayRecording" @click="recording.playUserRecording()">
        <Icon name="rotate-left" :size="15" :stroke-width="1.8" /> 回放
      </button>
      <button
        class="ctl"
        :disabled="!canCompare && !recording.comparisonActive"
        @click="onCompare"
      >
        <Icon :name="recording.activeLoopMode === 'comparison' ? 'stop' : 'code-compare'" :size="15" :stroke-width="1.8" />
        {{ recording.activeLoopMode === 'comparison' ? '停止' : '对照' }} <kbd>C</kbd>
      </button>
      <button
        class="ctl"
        :class="{ 'loop-on': recording.activeLoopMode }"
        @click.stop="onLoopButtonClick"
      >
        <Icon :name="recording.activeLoopMode ? 'stop' : 'repeat'" :size="15" :stroke-width="1.8" />
        {{ recording.activeLoopMode ? '停止循环' : '循环 ▸' }}
      </button>
      <label class="chk">
        <input type="checkbox" v-model="recording.autoRecordEnabled">播完自动录
      </label>
      <div v-show="loopMenuOpen" class="pop-menu" style="bottom: 56px" @click.stop>
        <button :disabled="!canPlayOriginal" @click="startLoop('original')">原音循环</button>
        <button :disabled="!canCompare" @click="startLoop('comparison')">对照循环</button>
      </div>
    </div>

    <button class="back-link" @click="app.switchMode('listening')">
      <Icon name="arrow-left" :size="14" :stroke-width="1.8" /> 返回听力
    </button>
  </div>
</template>

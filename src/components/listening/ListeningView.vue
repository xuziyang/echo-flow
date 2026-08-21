<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useFilesStore } from '../../stores/useFilesStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import { useTextMask } from '../../composables/useTextMask'
import { useSentenceWaveform } from '../../composables/useSentenceWaveform'
import BarWave from '../common/BarWave.vue'
import MaskableText from '../common/MaskableText.vue'
import Icon from '../Icon.vue'

const app = useAppStore()
const files = useFilesStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
const { maskText, toggleMask } = useTextMask()
const { currentSentence, sentenceSamples, sentenceDurationMs, sentenceProgress } = useSentenceWaveform()

const trackName = computed(() => {
  if (files.currentFile?.title) return files.currentFile.title
  if (!player.currentPath) return '未打开文件'
  const parts = player.currentPath.split(/[\\/]/)
  return parts[parts.length - 1] || '未知文件'
})

const statusLabel = computed(() => {
  if (transcript.isTranscribing) return `正在生成字幕 ${Math.round(transcript.transcribeProgress)}%`
  if (transcript.transcribeError && !transcript.sentences.length) return '字幕生成失败'
  if (player.isPlaying) return '播放中'
  if (player.positionMs > 0) return '已暂停'
  return '就绪'
})
const statusClass = computed(() => {
  if (transcript.isTranscribing) return 'warn'
  if (transcript.transcribeError && !transcript.sentences.length) return 'err'
  if (player.isPlaying) return 'playing'
  return ''
})

const totalProgress = computed(() => (
  player.durationMs > 0 ? Math.max(0, Math.min(1, player.positionMs / player.durationMs)) : 0
))

function formatTime(ms: number): string {
  if (!ms || ms < 0) return '00:00'
  const totalSecs = Math.floor(ms / 1000)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function gotoSentence(index: number) {
  const clamped = Math.max(0, Math.min(index, transcript.sentences.length - 1))
  player.setCurrentIndex(clamped)
  const sentence = transcript.sentences[clamped]
  if (Number.isFinite(sentence?.start_ms)) {
    void player.seekTo(sentence!.start_ms as number)
  }
}

function onProgressClick(event: MouseEvent) {
  if (player.durationMs <= 0) return
  const track = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - track.left) / track.width))
  void player.seekTo(ratio * player.durationMs)
}

function onVolumeInput(event: Event) {
  const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10)
  if (!Number.isFinite(parsed)) return
  void player.setVolume(Math.max(0, Math.min(parsed, 100)))
}

function onToggleMask() {
  toggleMask()
  app.showSubtitleToast(maskText.value ? '已遮蔽文本 · 点击大句可临时显示' : '已显示文本')
}

function onKeydown(e: KeyboardEvent) {
  if (app.isSettingsOpen) return
  // 任意模态（确认 / 重生成对话框）打开时不响应快捷键
  if (document.querySelector('.overlay')) return
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  if (e.code === 'Space') {
    e.preventDefault()
    player.togglePlay()
  } else if (e.code === 'KeyH') {
    e.preventDefault()
    onToggleMask()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="view animate-fade-in">
    <div class="ls-head">
      <span class="ls-filename">{{ trackName }}</span>
      <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>
      <button
        class="btn"
        style="margin-left: auto"
        data-tip="遮蔽 / 显示文本（H）"
        :disabled="!transcript.sentences.length"
        @click="onToggleMask"
      >
        <Icon :name="maskText ? 'eye' : 'eye-off'" :size="15" :stroke-width="1.8" />
        {{ maskText ? '显示文本' : '遮蔽文本' }}
      </button>
    </div>

    <div class="ls-center">
      <div class="wave-wrap">
        <div class="wave-label">
          <span class="chip" style="background: var(--accent)"></span>当前句波形
        </div>
        <BarWave
          v-if="sentenceSamples.length"
          :samples="sentenceSamples"
          :progress="sentenceProgress"
          :duration-ms="sentenceDurationMs"
          :text="currentSentence?.en ?? ''"
        />
        <div v-else class="wave-empty">
          {{ transcript.isTranscribing ? '正在生成字幕，完成后显示当前句波形' : '暂无波形' }}
        </div>
      </div>

      <div class="sentence-big">
        <template v-if="currentSentence?.en">“<MaskableText :text="currentSentence.en" :masked="maskText" />”</template>
        <template v-else-if="transcript.isTranscribing">正在生成字幕…</template>
        <template v-else>暂无字幕</template>
      </div>
      <div class="sentence-idx">
        <template v-if="transcript.sentences.length">第 {{ player.currentIndex + 1 }} 句 / 共 {{ transcript.sentences.length }} 句</template>
      </div>
    </div>

    <div class="transport">
      <button
        class="t-btn"
        data-tip="上一句"
        :disabled="player.currentIndex === 0"
        @click="gotoSentence(player.currentIndex - 1)"
      >
        <Icon name="backward-step" :size="16" :stroke-width="1.8" />
      </button>
      <button class="t-btn play" data-tip="播放 / 暂停（Space）" @click="player.togglePlay()">
        <Icon :name="player.isPlaying ? 'pause' : 'play'" :size="20" :stroke-width="1.8" />
      </button>
      <button
        class="t-btn"
        data-tip="下一句"
        :disabled="player.currentIndex >= transcript.sentences.length - 1"
        @click="gotoSentence(player.currentIndex + 1)"
      >
        <Icon name="forward-step" :size="16" :stroke-width="1.8" />
      </button>
      <div class="progress" @click="onProgressClick">
        <div class="track">
          <div class="fill" :style="{ width: `${totalProgress * 100}%` }"></div>
        </div>
      </div>
      <span class="time-label">{{ formatTime(player.positionMs) }} / {{ formatTime(player.durationMs) }}</span>
    </div>

    <div class="ls-bottom">
      <div class="vol">
        <button class="icon-btn" data-tip="静音（记住静音前音量）" @click="player.toggleMute()">
          <Icon :name="player.volume === 0 ? 'volume-xmark' : 'volume-high'" :size="16" :stroke-width="1.8" />
        </button>
        <input
          type="range"
          min="0"
          max="100"
          :value="player.volume"
          :disabled="player.volume === 0"
          @input="onVolumeInput"
        >
      </div>
      <div class="spacer"></div>
      <button class="btn btn-primary" @click="app.switchMode('shadowing')">
        进入跟读 <Icon name="arrow-right" :size="15" :stroke-width="1.8" />
      </button>
    </div>
  </div>
</template>

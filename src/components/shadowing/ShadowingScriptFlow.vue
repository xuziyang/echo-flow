<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import { getCurrentSubtitleIndex } from '../../composables/useSubtitleSync'
import { useConfirmDialog } from '../../composables/useConfirmDialog'
import Icon from '../Icon.vue'
import ScriptFlowItem from './ScriptFlowItem.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const transcript = useTranscriptStore()
const { confirmDialog } = useConfirmDialog()

const itemRefs = ref<Record<number, HTMLElement | null>>({})
const menuOpen = ref(false)

const counterLabel = computed(() => {
  const count = transcript.displaySentences.length
  if (!count) return '0 / 0 句'
  const index = transcript.isEditing && transcript.editingIndex !== null
    ? transcript.editingIndex
    : player.currentIndex
  return `${Math.min(index + 1, count)} / ${count} 句`
})
const isBusy = computed(() => (
  player.seeking
  || recording.isRecording
  || Boolean(recording.activePlaybackMode)
  || Boolean(recording.activeLoopMode)
))
const canRegenerateSubtitles = computed(() => (
  Boolean(transcript.currentAudioPath)
  && !isBusy.value
  && !transcript.isTranscribing
))
const canRegenerateSubtitleTexts = computed(() => (
  canRegenerateSubtitles.value
  && transcript.sentences.some(s => s.start_ms != null && s.end_ms != null)
))

function setItemRef(el: Element | ComponentPublicInstance | null, index: number) {
  itemRefs.value[index] = el && '$el' in el ? (el as ComponentPublicInstance).$el as HTMLElement : el as HTMLElement | null
}

function selectSentence(index: number, sentence: Sentence) {
  if (isBusy.value) return
  if (transcript.isEditing) {
    transcript.startEditing(index)
    return
  }
  player.setCurrentIndex(index)
  if (app.mode === 'listening') {
    void player.seekTo(sentence.start_ms ?? 0)
  }
}

function confirmRegenerateSubtitles() {
  menuOpen.value = false
  if (!canRegenerateSubtitles.value) return

  confirmDialog({
    title: '重新生成字幕？',
    keep: ['音频文件本身'],
    lose: ['该音频的全部录音', '所有未保存的字幕修改'],
    note: '时间轴将全部重新切分。',
    okText: '删除并重新生成',
    onOk: () => void transcript.regenerateSubtitles(),
  })
}

function confirmRegenerateSubtitleTexts() {
  menuOpen.value = false
  if (!canRegenerateSubtitleTexts.value) return

  confirmDialog({
    title: '重新识别每句文字？',
    keep: ['时间轴', '全部录音'],
    lose: ['你对文字做过的手动修改'],
    okText: '重新识别',
    onOk: () => void transcript.regenerateSubtitleTexts(),
  })
}

function retryTranscribe() {
  if (!transcript.currentAudioPath) return
  void transcript.startTranscribe(transcript.currentAudioPath)
}

function onDocumentClick() {
  menuOpen.value = false
}

watch(() => player.positionMs, (positionMs) => {
  if (app.mode !== 'listening') return
  if (transcript.isEditing) return
  if (player.seeking || !transcript.sentences.length) return

  const index = getCurrentSubtitleIndex(positionMs, transcript.sentences)
  if (index !== player.currentIndex) player.setCurrentIndex(index)
}, { immediate: true })

watch(() => player.currentIndex, async (index) => {
  if (transcript.isEditing) return
  await nextTick()
  itemRefs.value[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

watch(() => transcript.editingIndex, async (index) => {
  if (!transcript.isEditing || index === null) return
  await nextTick()
  itemRefs.value[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <aside class="subpanel">
    <div class="sub-head">
      <span class="t">字幕</span>
      <span class="sub-count">{{ counterLabel }}</span>
      <span v-if="transcript.isTranscribing" class="sub-progress">
        生成中 {{ Math.round(transcript.transcribeProgress) }}%
      </span>
      <div class="spacer"></div>

      <template v-if="transcript.isEditing">
        <button
          class="icon-btn"
          style="width: 28px; height: 28px"
          data-tip="保存全部修改"
          :disabled="!transcript.hasUnsavedChanges"
          @click="transcript.saveEdits()"
        >
          <Icon name="check" :size="14" :stroke-width="1.8" />
        </button>
        <button
          class="icon-btn"
          style="width: 28px; height: 28px"
          data-tip="放弃修改"
          @click="transcript.cancelEdits()"
        >
          <Icon name="xmark" :size="14" :stroke-width="1.8" />
        </button>
      </template>
      <template v-else>
        <button
          class="icon-btn"
          style="width: 28px; height: 28px"
          data-tip="编辑字幕"
          :disabled="isBusy || transcript.isTranscribing || transcript.sentences.length === 0"
          @click="transcript.enterEditMode()"
        >
          <Icon name="pen" :size="14" :stroke-width="1.8" />
        </button>
        <button
          class="icon-btn"
          style="width: 28px; height: 28px"
          data-tip="字幕操作"
          @click.stop="menuOpen = !menuOpen"
        >
          <Icon name="ellipsis" :size="15" :stroke-width="1.8" />
        </button>
      </template>

      <div v-show="menuOpen" class="pop-menu" style="top: 44px; right: 10px; min-width: 180px" @click.stop>
        <button :disabled="!canRegenerateSubtitles" @click="confirmRegenerateSubtitles">
          <Icon name="rotate-left" :size="14" :stroke-width="1.8" /> 重新生成字幕<span class="k">重做分段</span>
        </button>
        <button :disabled="!canRegenerateSubtitleTexts" @click="confirmRegenerateSubtitleTexts">
          <Icon name="pen" :size="14" :stroke-width="1.8" /> 只重识别文本<span class="k">保留时间轴</span>
        </button>
      </div>
    </div>

    <div v-if="transcript.isTranscribing" class="sub-state">
      <div class="state-card">
        <div class="stage-line">
          <span class="spin"></span>
          <span>{{ transcript.transcribeStatus || '正在生成字幕…' }}</span>
        </div>
        <div class="meter">
          <i :style="{ width: `${Math.max(3, Math.min(100, transcript.transcribeProgress))}%` }"></i>
        </div>
        <div style="font-size: 12px; color: var(--text2)">生成完成后即可开始练习</div>
      </div>
    </div>
    <div v-else-if="transcript.transcribeError && !transcript.sentences.length" class="sub-state">
      <div class="state-card err">
        <div class="t">无法生成字幕</div>
        <p>{{ transcript.transcribeError }}</p>
        <div class="row">
          <button class="btn btn-primary" @click="app.openSettings('models')">去设置下载</button>
          <button class="btn" @click="retryTranscribe">重试</button>
        </div>
      </div>
    </div>

    <div class="sub-list">
      <template v-if="transcript.displaySentences.length">
        <ScriptFlowItem
          v-for="(item, index) in transcript.displaySentences"
          :key="item.id"
          :ref="(el) => setItemRef(el as any, index)"
          :item="item"
          :index="index"
          :disabled="isBusy"
          @click="selectSentence(index, item)"
        />
      </template>
      <div v-else-if="!transcript.isTranscribing && !transcript.transcribeError" class="sub-empty">
        导入音频后自动生成字幕<br>点击句子可跳转播放
      </div>
    </div>
  </aside>
</template>

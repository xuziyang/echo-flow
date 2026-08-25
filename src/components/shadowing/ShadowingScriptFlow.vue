<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { toErrorMessage } from '../../utils/errors'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useModelDownloadStore } from '../../stores/useModelDownloadStore'
import { useSettingsStore, type WhisperModelType } from '../../stores/useSettingsStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import { getCurrentSubtitleIndex } from '../../composables/useSubtitleSync'
import Icon from '../Icon.vue'
import ScriptFlowItem from './ScriptFlowItem.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const modelDownload = useModelDownloadStore()
const settings = useSettingsStore()
const transcript = useTranscriptStore()

const itemRefs = ref<Record<number, HTMLElement | null>>({})
const menuOpen = ref(false)

/* 重生成对话框：选择处理方式 + Whisper 模型 */
type RegenerationAction = 'subtitles' | 'texts'
const regenOpen = ref(false)
const regenAction = ref<RegenerationAction>('subtitles')
const regenModel = ref<WhisperModelType>(settings.selectedWhisperModel)

const whisperModelOptions: Array<{ type: WhisperModelType; name: string }> = [
  { type: 'whisper-tiny', name: 'Tiny' },
  { type: 'whisper-base', name: 'Base' },
  { type: 'whisper-small', name: 'Small' },
  { type: 'whisper-medium', name: 'Medium' },
]

const selectedRegenModel = computed(() => {
  if (modelDownload.isModelInstalled(regenModel.value)) return regenModel.value
  return whisperModelOptions.find(m => modelDownload.isModelInstalled(m.type))?.type
    ?? regenModel.value
})
const canConfirmRegen = computed(() => (
  (regenAction.value === 'subtitles' ? canRegenerateSubtitles.value : canRegenerateSubtitleTexts.value)
  && modelDownload.isModelInstalled(selectedRegenModel.value)
  && !modelDownload.isDownloading
))

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

function openRegenDialog(action: RegenerationAction) {
  menuOpen.value = false
  if (!canRegenerateSubtitles.value) return
  regenModel.value = selectedRegenModel.value
  regenAction.value = action
  regenOpen.value = true
}

function confirmRegen() {
  if (!canConfirmRegen.value) return
  const action = regenAction.value
  const whisperModel = selectedRegenModel.value
  regenOpen.value = false
  if (action === 'texts') {
    void transcript.regenerateSubtitleTexts(whisperModel)
  } else {
    void transcript.regenerateSubtitles(whisperModel)
  }
}

function onRegenKeydown(e: KeyboardEvent) {
  if (!regenOpen.value || e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  regenOpen.value = false
}

function retryTranscribe() {
  if (!transcript.currentAudioPath) return
  void transcript.startTranscribe(transcript.currentAudioPath)
}

async function requestRequiredModels() {
  try {
    await modelDownload.downloadRequiredModels()
  } catch (error) {
    app.showSubtitleToast(toErrorMessage(error), 'error')
  }
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

watch(() => settings.selectedWhisperModel, (model) => {
  if (modelDownload.isModelInstalled(regenModel.value)) return
  regenModel.value = model
})

watch(() => modelDownload.downloadedModels, () => {
  regenModel.value = selectedRegenModel.value
}, { deep: true })

onMounted(() => {
  void modelDownload.checkModels()
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('keydown', onRegenKeydown, { capture: true })
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('keydown', onRegenKeydown, { capture: true })
})
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
        <button :disabled="!canRegenerateSubtitles" @click="openRegenDialog('subtitles')">
          <Icon name="rotate-left" :size="14" :stroke-width="1.8" /> 重新生成字幕<span class="k">重做分段</span>
        </button>
        <button :disabled="!canRegenerateSubtitleTexts" @click="openRegenDialog('texts')">
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
    <div v-else-if="transcript.needsModelSetup && !transcript.sentences.length" class="sub-state">
      <div class="state-card">
        <div class="t">字幕需要先下载模型（约 520 MB，只需一次）</div>
        <p>现在可以先听音频；下完后会自动生成字幕。</p>
        <div v-if="modelDownload.isDownloading">
          <div class="meter"><i :style="{ width: `${Math.max(3, Math.min(100, modelDownload.downloadProgressPercent))}%` }"></i></div>
          <div class="row">
            <span style="font-size: 12.5px; color: var(--text2)">{{ modelDownload.downloadProgressPercent.toFixed(0) }}%</span>
            <button class="btn" style="padding: 3px 9px; font-size: 12px" @click="modelDownload.cancelDownload()">取消</button>
          </div>
        </div>
        <div v-else class="row">
          <button class="btn btn-primary" @click="requestRequiredModels">下载还缺的模型</button>
          <button class="btn" @click="app.openSettings('models')">打开设置</button>
        </div>
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
      <div v-else-if="!transcript.isTranscribing && !transcript.transcribeError && !transcript.needsModelSetup" class="sub-empty">
        导入音频后自动生成字幕<br>点击句子可跳转播放
      </div>
    </div>

    <!-- 重生成对话框：选择处理方式 + Whisper 模型 -->
    <div v-if="regenOpen" class="overlay" @click.self="regenOpen = false">
      <div class="dialog" style="width: 420px" role="dialog" aria-modal="true">
        <h3>重新生成</h3>
        <div class="note">选择处理方式和 Whisper 模型。</div>

        <div class="opt-grid">
          <button
            type="button"
            class="opt-card"
            :class="{ active: regenAction === 'subtitles' }"
            @click="regenAction = 'subtitles'"
          >
            <span class="t">重新生成字幕</span>
            <span class="d">重新切分时间轴，适合字幕错位或分句混乱；会删除该音频的录音</span>
          </button>
          <button
            type="button"
            class="opt-card"
            :class="{ active: regenAction === 'texts' }"
            :disabled="!canRegenerateSubtitleTexts"
            @click="regenAction = 'texts'"
          >
            <span class="t">只重识别文本</span>
            <span class="d">保留时间轴与录音，只更新每句文字；不修正原有分句</span>
          </button>
        </div>

        <div class="opt-grid">
          <button
            v-for="model in whisperModelOptions"
            :key="model.type"
            type="button"
            class="opt-card"
            :class="{ active: regenModel === model.type }"
            :disabled="!modelDownload.isModelInstalled(model.type)"
            @click="regenModel = model.type"
          >
            <span class="t">{{ model.name }}</span>
            <span
              class="d"
              :style="modelDownload.isModelInstalled(model.type) ? 'color: var(--accent)' : ''"
            >
              {{ modelDownload.isModelInstalled(model.type) ? '已安装' : '未安装' }}
            </span>
          </button>
        </div>

        <div class="actions">
          <button class="btn" @click="regenOpen = false">取消</button>
          <button
            class="btn"
            :class="regenAction === 'subtitles' ? 'btn-danger' : 'btn-primary'"
            :disabled="!canConfirmRegen"
            @click="confirmRegen"
          >
            {{ regenAction === 'texts' ? '重新识别' : '删除并重新生成' }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

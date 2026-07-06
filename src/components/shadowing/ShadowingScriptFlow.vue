<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useModelDownloadStore, type ModelType } from '../../stores/useModelDownloadStore'
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
const regenerationWhisperModel = ref<WhisperModelType>(settings.selectedWhisperModel)
const regenerationAction = ref<'subtitles' | 'texts' | null>(null)

const whisperModelOptions: Array<{ type: WhisperModelType; name: string }> = [
  { type: 'whisper-tiny', name: 'Tiny' },
  { type: 'whisper-base', name: 'Base' },
  { type: 'whisper-small', name: 'Small' },
  { type: 'whisper-medium', name: 'Medium' },
]

const itemRefs = ref<Record<number, HTMLElement | null>>({})
const counterLabel = computed(() => {
  const count = transcript.displaySentences.length
  if (!count) return '0/0'
  const index = transcript.isEditing && transcript.editingIndex !== null
    ? transcript.editingIndex
    : player.currentIndex
  return `${Math.min(index + 1, count)}/${count}`
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
const selectedRegenerationModel = computed(() => {
  if (modelDownload.isModelInstalled(regenerationWhisperModel.value as ModelType)) {
    return regenerationWhisperModel.value
  }

  return whisperModelOptions.find(model => modelDownload.isModelInstalled(model.type))?.type
    ?? regenerationWhisperModel.value
})
const canConfirmRegeneration = computed(() => (
  regenerationAction.value !== null
  && (regenerationAction.value === 'subtitles' || canRegenerateSubtitleTexts.value)
  && modelDownload.isModelInstalled(selectedRegenerationModel.value as ModelType)
  && !modelDownload.isDownloading
))
const regenerationConfirmLabel = computed(() => (
  regenerationAction.value === 'texts' ? '重新识别文本' : '重新生成字幕'
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

function openRegenerationDialog() {
  if (!canRegenerateSubtitles.value) return

  regenerationWhisperModel.value = selectedRegenerationModel.value
  regenerationAction.value = 'subtitles'
}

function closeRegenerationDialog() {
  regenerationAction.value = null
}

function confirmRegeneration() {
  if (!canConfirmRegeneration.value) return

  const action = regenerationAction.value
  const whisperModel = selectedRegenerationModel.value
  regenerationAction.value = null

  if (action === 'texts') {
    void transcript.regenerateSubtitleTexts(whisperModel)
    return
  }

  void transcript.regenerateSubtitles(whisperModel)
}

function confirmRegenerateSubtitles() {
  if (!canRegenerateSubtitles.value) return

  openRegenerationDialog()
}

onMounted(() => {
  void modelDownload.checkModels()
})

watch(() => settings.selectedWhisperModel, (model) => {
  if (modelDownload.isModelInstalled(regenerationWhisperModel.value as ModelType)) return
  regenerationWhisperModel.value = model
})

watch(() => modelDownload.downloadedModels, () => {
  regenerationWhisperModel.value = selectedRegenerationModel.value
}, { deep: true })

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
</script>

<template>
  <div class="relative w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex flex-col z-10 transition-colors min-h-0 h-[48vh] lg:h-full"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 transition-colors"
         :class="app.theme === 'dark' ? 'border-dark-border' : 'border-light-border'">
      <h3 class="text-xs font-bold uppercase tracking-wide"
          :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">Script Flow</h3>
      <div class="flex items-center gap-1">
        <span class="text-xs font-mono"
              :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">
          {{ counterLabel }}
        </span>
        <button
          type="button"
          class="h-6 w-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="app.theme === 'dark'
            ? 'text-gray-300 hover:text-white hover:bg-white/10'
            : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'"
          :disabled="!canRegenerateSubtitles"
          title="Regenerate subtitles"
          @click="confirmRegenerateSubtitles"
        >
          <Icon name="rotate-left" :size="13" />
        </button>
        <template v-if="transcript.isEditing">
          <button
            type="button"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            :class="app.theme === 'dark'
              ? 'text-emerald-300 hover:bg-white/10'
              : 'text-emerald-700 hover:bg-black/[0.06]'"
            :disabled="!transcript.hasUnsavedChanges"
            title="Save subtitle edits"
            @click="transcript.saveEdits()"
          >
            <Icon name="check" :size="13" />
          </button>
          <button
            type="button"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="app.theme === 'dark'
              ? 'text-gray-300 hover:text-white hover:bg-white/10'
              : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'"
            title="Cancel subtitle edits"
            @click="transcript.cancelEdits()"
          >
            <Icon name="xmark" :size="13" />
          </button>
        </template>
        <button
          v-else
          type="button"
          class="h-6 w-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="app.theme === 'dark'
            ? 'text-gray-300 hover:text-white hover:bg-white/10'
            : 'text-gray-600 hover:text-black hover:bg-black/[0.06]'"
          :disabled="isBusy || transcript.isTranscribing || transcript.sentences.length === 0"
          title="Edit subtitles"
          @click="transcript.enterEditMode()"
        >
          <Icon name="pen" :size="13" />
        </button>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar p-1.5 space-y-0.5">
      <div v-if="transcript.isTranscribing"
           class="h-full min-h-40 flex flex-col items-center justify-center gap-3 px-5 text-center">
        <div class="h-8 w-8 rounded-full border-2 border-transparent animate-spin"
             :class="app.theme === 'dark' ? 'border-t-brand-400 border-r-brand-400/40' : 'border-t-black border-r-black/30'" />
        <div class="w-full max-w-56">
          <div class="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide"
               :class="app.theme === 'dark' ? 'text-gray-300' : 'text-gray-700'">
            <span>Generating subtitles</span>
            <span>{{ Math.round(transcript.transcribeProgress) }}%</span>
          </div>
          <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full"
               :class="app.theme === 'dark' ? 'bg-white/10' : 'bg-black/10'">
            <div class="h-full rounded-full transition-all duration-300"
                 :class="app.theme === 'dark' ? 'bg-brand-400' : 'bg-black'"
                 :style="{ width: `${Math.max(3, Math.min(100, transcript.transcribeProgress))}%` }" />
          </div>
          <p class="mt-2 text-xs"
             :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
            {{ transcript.transcribeStatus || 'Preparing transcription' }}
          </p>
        </div>
      </div>
      <div v-else-if="transcript.transcribeError && !transcript.sentences.length"
           class="h-full min-h-40 flex flex-col items-center justify-center gap-2 px-5 text-center">
        <p class="text-xs font-semibold uppercase tracking-wide"
           :class="app.theme === 'dark' ? 'text-red-300' : 'text-red-700'">
          Subtitle generation failed
        </p>
        <p class="max-w-64 text-xs leading-relaxed"
           :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
          {{ transcript.transcribeError }}
        </p>
      </div>
      <template v-else>
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
    </div>
    <div
      v-if="regenerationAction"
      class="absolute inset-0 z-30 flex items-center justify-center px-4"
      :class="app.theme === 'dark' ? 'bg-black/55' : 'bg-white/65'"
      @click.self="closeRegenerationDialog"
    >
      <div
        class="w-full max-w-[300px] border p-4 shadow-xl backdrop-blur-xl"
        :class="app.theme === 'dark'
          ? 'border-white/10 bg-zinc-950/95 text-white'
          : 'border-black/10 bg-white/95 text-black'"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h4 class="text-sm font-semibold">重新生成</h4>
            <p class="mt-1 text-xs leading-relaxed"
               :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
              选择处理方式和 Whisper 模型。
            </p>
          </div>
          <button
            type="button"
            class="h-7 w-7 flex flex-shrink-0 items-center justify-center rounded-md transition-colors"
            :class="app.theme === 'dark'
              ? 'text-gray-300 hover:bg-white/10 hover:text-white'
              : 'text-gray-500 hover:bg-black/[0.06] hover:text-black'"
            title="Close"
            @click="closeRegenerationDialog"
          >
            <Icon name="xmark" :size="14" />
          </button>
        </div>

        <div class="mt-4 space-y-2">
          <button
            type="button"
            class="w-full rounded-md border px-3 py-2 text-left transition-colors"
            :class="regenerationAction === 'subtitles'
              ? app.theme === 'dark'
                ? 'border-brand-400 bg-brand-400/15 text-white'
                : 'border-black bg-black/[0.06] text-black'
              : app.theme === 'dark'
                ? 'border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/10'
                : 'border-black/10 bg-black/[0.02] text-gray-700 hover:bg-black/[0.06]'"
            @click="regenerationAction = 'subtitles'"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold">重新生成字幕</span>
              <span
                class="group relative flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                :class="app.theme === 'dark' ? 'bg-white/10 text-gray-300' : 'bg-black/10 text-gray-600'"
              >
                ?
                <span
                  class="pointer-events-none absolute right-0 top-5 z-40 hidden w-48 rounded-md border px-3 py-2 text-[10px] font-normal leading-relaxed shadow-lg group-hover:block"
                  :class="app.theme === 'dark'
                    ? 'border-white/10 bg-zinc-900 text-gray-200'
                    : 'border-black/10 bg-white text-gray-700'"
                >
                  <span class="block">优点：重新切分时间轴，适合字幕错位或分句混乱</span>
                  <span class="mt-1 block">缺点：覆盖字幕和缓存，并删除当前音频的录音</span>
                </span>
              </span>
            </span>
            <span class="mt-0.5 block text-[10px] leading-relaxed"
                  :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
              重新切分字幕和时间轴
            </span>
          </button>
          <button
            type="button"
            class="w-full rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            :class="regenerationAction === 'texts'
              ? app.theme === 'dark'
                ? 'border-brand-400 bg-brand-400/15 text-white'
                : 'border-black bg-black/[0.06] text-black'
              : app.theme === 'dark'
                ? 'border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/10'
                : 'border-black/10 bg-black/[0.02] text-gray-700 hover:bg-black/[0.06]'"
            :disabled="!canRegenerateSubtitleTexts"
            @click="regenerationAction = 'texts'"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold">只重新识别文本</span>
              <span
                class="group relative flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                :class="app.theme === 'dark' ? 'bg-white/10 text-gray-300' : 'bg-black/10 text-gray-600'"
              >
                ?
                <span
                  class="pointer-events-none absolute right-0 top-5 z-40 hidden w-48 rounded-md border px-3 py-2 text-[10px] font-normal leading-relaxed shadow-lg group-hover:block"
                  :class="app.theme === 'dark'
                    ? 'border-white/10 bg-zinc-900 text-gray-200'
                    : 'border-black/10 bg-white text-gray-700'"
                >
                  <span class="block">优点：保留时间边界和录音，只更新每句文本</span>
                  <span class="mt-1 block">缺点：不修正原有时间轴，分句错误会被保留</span>
                </span>
              </span>
            </span>
            <span class="mt-0.5 block text-[10px] leading-relaxed"
                  :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'">
              保留录音和原时间轴
            </span>
          </button>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            v-for="model in whisperModelOptions"
            :key="model.type"
            type="button"
            class="min-h-12 rounded-md border px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            :class="[
              regenerationWhisperModel === model.type
                ? app.theme === 'dark'
                  ? 'border-brand-400 bg-brand-400/15 text-white'
                  : 'border-black bg-black/[0.06] text-black'
                : app.theme === 'dark'
                  ? 'border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/10'
                  : 'border-black/10 bg-black/[0.02] text-gray-700 hover:bg-black/[0.06]',
            ]"
            :disabled="!modelDownload.isModelInstalled(model.type)"
            @click="regenerationWhisperModel = model.type"
          >
            <span class="block text-xs font-semibold">{{ model.name }}</span>
            <span
              class="mt-0.5 block text-[10px]"
              :class="modelDownload.isModelInstalled(model.type)
                ? app.theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
                : app.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'"
            >
              {{ modelDownload.isModelInstalled(model.type) ? 'Installed' : 'Not installed' }}
            </span>
          </button>
        </div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            class="h-8 rounded-md px-3 text-xs font-semibold transition-colors"
            :class="app.theme === 'dark'
              ? 'text-gray-300 hover:bg-white/10 hover:text-white'
              : 'text-gray-600 hover:bg-black/[0.06] hover:text-black'"
            @click="closeRegenerationDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            class="h-8 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            :class="app.theme === 'dark'
              ? 'bg-brand-400 text-black hover:bg-brand-300'
              : 'bg-black text-white hover:bg-gray-800'"
            :disabled="!canConfirmRegeneration"
            @click="confirmRegeneration"
          >
            {{ regenerationConfirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import { getCurrentSubtitleIndex } from '../../composables/useSubtitleSync'
import ScriptFlowItem from './ScriptFlowItem.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
const transcript = useTranscriptStore()

const itemRefs = ref<Record<number, HTMLElement | null>>({})
const counterLabel = computed(() => {
  if (!transcript.sentences.length) return '0/0'
  return `${player.currentIndex + 1}/${transcript.sentences.length}`
})
const isBusy = computed(() => (
  player.seeking
  || recording.isRecording
  || Boolean(recording.activePlaybackMode)
))

function setItemRef(el: Element | ComponentPublicInstance | null, index: number) {
  itemRefs.value[index] = el && '$el' in el ? (el as ComponentPublicInstance).$el as HTMLElement : el as HTMLElement | null
}

function selectSentence(index: number, sentence: Sentence) {
  if (isBusy.value) return
  player.setCurrentIndex(index)
  if (app.mode === 'listening') {
    void player.seekTo(sentence.start_ms ?? 0)
  }
}

watch(() => player.positionMs, (positionMs) => {
  if (app.mode !== 'listening') return
  if (player.seeking || !transcript.sentences.length) return

  const index = getCurrentSubtitleIndex(positionMs, transcript.sentences)
  if (index !== player.currentIndex) player.setCurrentIndex(index)
}, { immediate: true })

watch(() => player.currentIndex, async (index) => {
  await nextTick()
  itemRefs.value[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})
</script>

<template>
  <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex flex-col z-10 transition-colors min-h-0 h-[48vh] lg:h-full"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 transition-colors"
         :class="app.theme === 'dark' ? 'border-dark-border' : 'border-light-border'">
      <h3 class="text-xs font-bold uppercase tracking-wide"
          :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">Script Flow</h3>
      <span class="text-xs font-mono"
            :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">
        {{ counterLabel }}
      </span>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
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
          v-for="(item, index) in transcript.sentences"
          :key="item.id"
          :ref="(el) => setItemRef(el as any, index)"
          :item="item"
          :index="index"
          :disabled="isBusy"
          @click="selectSentence(index, item)"
        />
      </template>
    </div>
  </div>
</template>

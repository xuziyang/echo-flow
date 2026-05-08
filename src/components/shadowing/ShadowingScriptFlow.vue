<script setup lang="ts">
import { nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import { getCurrentSubtitleIndex } from '../../composables/useSubtitleSync'
import ScriptFlowItem from './ScriptFlowItem.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()

const itemRefs = ref<Record<number, HTMLElement | null>>({})

function setItemRef(el: Element | ComponentPublicInstance | null, index: number) {
  itemRefs.value[index] = el && '$el' in el ? (el as ComponentPublicInstance).$el as HTMLElement : el as HTMLElement | null
}

function selectSentence(index: number, sentence: Sentence) {
  player.setCurrentIndex(index)
  if (app.mode === 'listening') {
    void player.seekTo(sentence.start_ms ?? 0)
  }
}

watch(() => player.positionMs, (positionMs) => {
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
        {{ player.currentIndex + 1 }}/{{ transcript.sentences.length }}
      </span>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
      <ScriptFlowItem
        v-for="(item, index) in transcript.sentences"
        :key="item.id"
        :ref="(el) => setItemRef(el as any, index)"
        :item="item"
        :index="index"
        @click="selectSentence(index, item)"
      />
    </div>
  </div>
</template>

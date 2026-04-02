<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import ScriptFlowItem from './ScriptFlowItem.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
</script>

<template>
  <div class="w-80 border-l flex flex-col z-10 transition-colors"
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
        :item="item"
        :index="index"
        @click="player.setCurrentIndex(index)"
      />
    </div>
  </div>
</template>

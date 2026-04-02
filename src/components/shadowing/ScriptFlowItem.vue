<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { type Sentence } from '../../stores/useTranscriptStore'

const props = defineProps<{ item: Sentence; index: number }>()
const emit = defineEmits<{ click: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()

const isActive = computed(() => props.index === player.currentIndex)
const isDone = computed(() => props.index < player.currentIndex)
</script>

<template>
  <div @click="emit('click', index)"
       class="p-3 rounded-lg border cursor-pointer transition-all group flex gap-3 items-start"
       :class="isActive
          ? (app.theme === 'dark' ? 'bg-brand-900/20 border-brand-500/30' : 'bg-gray-200 border-transparent')
          : (app.theme === 'dark' ? 'border-transparent hover:bg-dark-highlight opacity-50 hover:opacity-100' : 'border-transparent hover:bg-gray-200 opacity-50 hover:opacity-100')">

    <!-- Status Icon -->
    <div class="mt-0.5">
      <template v-if="isDone">
        <i class="fa-solid fa-circle-check text-green-500 text-xs"></i>
      </template>
      <template v-else-if="isActive">
        <div class="w-2 h-2 rounded-full mt-1.5 animate-pulse"
             :class="app.theme === 'dark' ? 'bg-brand-500' : 'bg-black'"></div>
      </template>
      <template v-else>
        <div class="w-2 h-2 rounded-full mt-1.5"
             :class="app.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'"></div>
      </template>
    </div>

    <div>
      <p class="text-sm leading-snug transition-colors"
         :class="isActive
            ? (app.theme === 'dark' ? 'text-white font-medium' : 'text-black font-medium')
            : (app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500')">
        {{ item.en }}
      </p>
    </div>
  </div>
</template>

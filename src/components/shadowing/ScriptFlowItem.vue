<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { type Sentence } from '../../stores/useTranscriptStore'

const props = defineProps<{ item: Sentence; index: number }>()
const emit = defineEmits<{ click: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()
const isHovered = ref(false)

const isActive = computed(() => props.index === player.currentIndex)
const itemClass = computed(() => {
  if (isActive.value) {
    return app.theme === 'dark'
      ? 'bg-brand-900/20 border-brand-500/30 opacity-100'
      : 'bg-gray-200 border-transparent opacity-100'
  }

  if (isHovered.value) {
    return app.theme === 'dark'
      ? 'border-transparent bg-dark-highlight opacity-100'
      : 'border-transparent bg-gray-200 opacity-100'
  }

  return app.theme === 'dark'
    ? 'border-transparent opacity-50'
    : 'border-transparent opacity-50'
})
</script>

<template>
  <div @click="emit('click', index)"
       @mouseenter="isHovered = true"
       @mouseleave="isHovered = false"
       class="p-3 rounded-lg border cursor-pointer transition-all group flex gap-3 items-start"
       :class="itemClass">

    <!-- Status Icon -->
    <div class="mt-0.5">
      <div class="w-2 h-2 rounded-full mt-1.5"
           :class="isActive
              ? (app.theme === 'dark' ? 'bg-brand-500 animate-pulse' : 'bg-black animate-pulse')
              : (app.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300')"></div>
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

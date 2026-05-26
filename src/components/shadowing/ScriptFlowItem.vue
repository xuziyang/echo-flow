<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { type Sentence } from '../../stores/useTranscriptStore'

const props = defineProps<{ item: Sentence; index: number; disabled?: boolean }>()
const emit = defineEmits<{ click: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()
const isActive = computed(() => props.index === player.currentIndex)
const itemClass = computed(() => {
  if (isActive.value) {
    return app.theme === 'dark'
      ? 'bg-brand-900/20 border-brand-500/30 opacity-100 shadow-md shadow-brand-500/10'
      : 'bg-gray-200 border-transparent opacity-100 shadow-md shadow-black/5'
  }

  return app.theme === 'dark'
    ? `border-transparent opacity-50 ${props.disabled ? 'cursor-not-allowed' : 'hover:opacity-85 hover:bg-white/5 hover:shadow-sm hover:shadow-white/5'}`
    : `border-transparent opacity-50 ${props.disabled ? 'cursor-not-allowed' : 'hover:opacity-85 hover:bg-gray-100 hover:shadow-sm hover:shadow-black/5'}`
})
</script>

<template>
  <div @click="!disabled && emit('click', index)"

       class="p-3 rounded-lg border transition-all group flex gap-3 items-start"
       :class="[itemClass, disabled ? 'cursor-not-allowed' : 'cursor-pointer']"
       >

    <!-- Status Icon -->
    <div class="mt-0.5">
      <div class="w-2 h-2 rounded-full mt-1.5"
           :class="isActive
              ? (app.theme === 'dark' ? 'bg-brand-500 animate-pulse' : 'bg-black animate-pulse')
              : (app.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300')"></div>
    </div>

    <div>
      <p class="text-sm leading-snug transition-colors group-hover:font-medium"
         :class="isActive
            ? (app.theme === 'dark' ? 'text-white font-medium' : 'text-black font-medium')
            : (app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500')">
        {{ item.en }}
      </p>
    </div>
  </div>
</template>

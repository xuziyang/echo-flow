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
      : 'bg-gray-100 border-transparent opacity-100 shadow-sm shadow-black/5'
  }

  return app.theme === 'dark'
    ? `bg-transparent border-transparent opacity-50 shadow-none ${props.disabled ? 'cursor-not-allowed' : 'hover:opacity-85 hover:bg-white/5'}`
    : `bg-transparent border-transparent opacity-50 shadow-none ${props.disabled ? 'cursor-not-allowed' : 'hover:opacity-100 hover:bg-gray-200'}`
})
</script>

<template>
  <div @click="!disabled && emit('click', index)"

       class="p-3 rounded-lg border transition-colors duration-150 group flex gap-3 items-start"
       :class="[itemClass, disabled ? 'cursor-not-allowed' : 'cursor-pointer']"
       >

    <div
      class="flex h-[1.25rem] min-w-6 items-center justify-center px-1 text-[10px] font-medium leading-none tabular-nums transition-colors"
      :class="isActive
        ? (app.theme === 'dark' ? 'text-brand-300' : 'text-gray-700')
        : (app.theme === 'dark' ? 'text-gray-600' : 'text-gray-400')"
    >
      {{ index + 1 }}
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

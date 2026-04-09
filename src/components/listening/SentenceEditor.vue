<!-- src/components/listening/SentenceEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'

defineProps<{ index: number; sentenceId: number }>()
const app = useAppStore()
const transcript = useTranscriptStore()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

onMounted(() => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      const len = textareaRef.value.value.length
      textareaRef.value.setSelectionRange(len, len)
    }
  })
})
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-start">
      <textarea
        ref="textareaRef"
        rows="2"
        class="w-full text-base leading-6 rounded-xl border px-3 py-2 outline-none resize-none transition-colors"
        :class="app.theme === 'dark' ? 'bg-zinc-950 border-zinc-700 text-white focus:border-zinc-500' : 'bg-white border-gray-300 text-black focus:border-gray-500'"
        :value="transcript.draftSentences[index]?.en"
        @input="transcript.updateDraft(index, ($event.target as HTMLTextAreaElement).value)"
        @keydown.enter.exact.prevent="$emit('split', index)"
        @keydown.meta.enter.prevent="transcript.finishEditing()"
        @keydown.ctrl.enter.prevent="transcript.finishEditing()"
        @keydown.escape.prevent="transcript.finishEditing()"
      />
    </div>
    <div class="text-[10px] tracking-[0.12em] uppercase"
         :class="app.theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'">
      Press Enter to split at the cursor. Cmd/Ctrl + Enter finishes the current line.
    </div>
  </div>
</template>

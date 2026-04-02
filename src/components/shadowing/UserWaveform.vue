<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const recording = useRecordingStore()

const animBars = Array.from({ length: 100 }, () => Math.random() * 80 + 10)
</script>

<template>
  <div class="flex-1 relative flex flex-col justify-center group border-t transition-colors"
       :class="app.theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-gray-50 border-gray-200'">
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-colors"
            :class="app.theme === 'dark' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-white text-gray-500 border border-gray-200'">You</span>
    </div>

    <div class="absolute top-4 right-4 z-10 flex items-center gap-2">
      <button v-if="recording.userAudioUrl && !recording.isRecording"
              @click="recording.playComparison()"
              class="px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-2"
              :class="app.theme === 'dark' ? 'bg-zinc-200 hover:bg-white text-black border-zinc-200' : 'bg-black hover:bg-gray-800 text-white border-black'"
              title="快捷键: C">
        <Icon name="code-compare" /> Contrast
      </button>
    </div>

    <div class="w-full px-10 h-24 flex items-center justify-center gap-1">
      <template v-if="recording.isRecording">
        <div v-for="(_, i) in animBars" :key="i"
             class="w-1 bg-red-500 rounded-full animate-wave"
             :style="`height: ${animBars[i]}%; animation-delay: ${i * 0.05}s`"></div>
      </template>
      <template v-else>
        <div class="text-sm font-light tracking-wide"
             :class="app.theme === 'dark' ? 'text-zinc-600' : 'text-gray-400'">Tap microphone to record</div>
      </template>
    </div>
  </div>
</template>

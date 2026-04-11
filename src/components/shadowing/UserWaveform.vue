<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const recording = useRecordingStore()

// 100 bars, matching ui/index.html: Math.random() * 80 + 10 → 10%–90%
const recordingBars = Array.from({ length: 100 }, (_, index) => ({
  id: index,
  height: Math.floor(Math.random() * 80 + 10),
  delay: index * 0.05,
}))
</script>

<template>
  <div class="flex-1 relative flex flex-col justify-center group border-t transition-colors"
       :class="app.theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-gray-50 border-gray-200'">
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-colors"
            :class="app.theme === 'dark' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-white text-gray-500 border border-gray-200'">You</span>
    </div>

    <div class="absolute top-4 right-8 z-10 flex items-center gap-2">
      <button v-if="recording.userAudioUrl && !recording.isRecording"
              @click="recording.playComparison()"
              class="px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-2"
              :class="app.theme === 'dark' ? 'bg-zinc-200 hover:bg-white text-black border-zinc-200' : 'bg-black hover:bg-gray-800 text-white border-black'"
              title="快捷键: C">
        <Icon name="code-compare" /> Contrast
      </button>
    </div>

    <!-- 录音中动画 -->
    <div v-if="recording.isRecording" class="w-full h-24 px-6 md:px-10 flex items-center justify-center">
      <div class="flex h-full w-full max-w-3xl items-center gap-1 overflow-hidden">
        <div
          v-for="bar in recordingBars"
          :key="bar.id"
          class="w-1 rounded-full bg-red-500 animate-wave"
          :style="{ height: `${bar.height}%`, animationDelay: `${bar.delay}s` }"
        />
      </div>
    </div>

    <!-- 无数据时占位 -->
    <div class="w-full px-10 h-24 flex items-center justify-center">
      <span class="text-sm font-light tracking-wide"
            :class="app.theme === 'dark' ? 'text-zinc-600' : 'text-gray-400'">Tap microphone to record</span>
    </div>
  </div>
</template>

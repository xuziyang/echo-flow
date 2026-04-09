<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import { useWaveform } from '../../composables/useWaveform'
import Icon from '../Icon.vue'

const app = useAppStore()
const recording = useRecordingStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const hasData = computed(() => recording.userWaveformSamples.length > 0)

const colors = computed(() => ({
  activeColor: '#ef4444',   // red-500
  inactiveColor: app.theme === 'dark' ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.3)',
  playedColor: '#f87171',    // red-400
}))

useWaveform(canvasRef, {
  samples: computed(() => recording.userWaveformSamples),
  isPlaying: ref(false),
  progress: ref(0),
  ...colors.value,
})
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
    <div v-if="recording.isRecording" class="w-full px-10 h-24 flex items-center justify-center gap-1">
      <div v-for="(_, i) in 100" :key="i"
           class="w-1 bg-red-500 rounded-full animate-wave"
           :style="`height: ${Math.random() * 80 + 10}%; animation-delay: ${i * 0.03}s`"></div>
    </div>

    <!-- 录音完成后：显示波形 canvas -->
    <template v-else-if="hasData">
      <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />
    </template>

    <!-- 无数据时占位 -->
    <div v-else class="w-full px-10 h-24 flex items-center justify-center">
      <span class="text-sm font-light tracking-wide"
            :class="app.theme === 'dark' ? 'text-zinc-600' : 'text-gray-400'">Tap microphone to record</span>
    </div>
  </div>
</template>

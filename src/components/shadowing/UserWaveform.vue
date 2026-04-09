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
const recordingBars = Array.from({ length: 48 }, (_, index) => ({
  id: index,
  height: 24 + ((index * 17) % 56),
  delay: index * 0.035,
}))

const colors = computed(() => ({
  activeColor: '#ef4444',   // red-500
  inactiveColor: app.theme === 'dark' ? 'rgba(239,68,68,0.38)' : 'rgba(239,68,68,0.35)',
  playedColor: '#f87171',    // red-400
  backgroundColor: app.theme === 'dark' ? '#191d22' : '#ececec',
  gridColor: app.theme === 'dark' ? 'rgba(130,145,163,0.16)' : 'rgba(127,135,145,0.2)',
  centerLineColor: app.theme === 'dark' ? 'rgba(181,93,93,0.5)' : 'rgba(170,96,96,0.46)',
}))

useWaveform(canvasRef, {
  samples: computed(() => recording.userWaveformSamples),
  isPlaying: ref(false),
  progress: ref(0),
  zoom: ref(1),
  activeColor: computed(() => colors.value.activeColor),
  inactiveColor: computed(() => colors.value.inactiveColor),
  playedColor: computed(() => colors.value.playedColor),
  backgroundColor: computed(() => colors.value.backgroundColor),
  gridColor: computed(() => colors.value.gridColor),
  centerLineColor: computed(() => colors.value.centerLineColor),
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
    <div v-if="recording.isRecording" class="w-full h-24 px-6 md:px-10 flex items-center justify-center">
      <div class="flex h-full w-full max-w-3xl items-center gap-1 overflow-hidden">
        <div
          v-for="bar in recordingBars"
          :key="bar.id"
          class="min-w-0 flex-1 rounded-full bg-red-500 animate-wave"
          :style="{ height: `${bar.height}%`, animationDelay: `${bar.delay}s`, maxWidth: '6px' }"
        />
      </div>
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

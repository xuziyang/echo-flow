<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const recording = useRecordingStore()
</script>

<template>
  <div class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center group">
    <button @click="recording.toggleRecording()"
            class="w-20 h-20 rounded-full flex items-center justify-center text-2xl transition-all relative border z-10"
            :class="(recording.isRecording ? 'recording-ring ' : '') +
               (app.theme === 'dark'
                 ? (recording.isRecording ? 'bg-black text-red-500 border-zinc-700' : 'bg-black text-zinc-400 hover:text-white border-zinc-700 hover:border-zinc-500')
                 : (recording.isRecording ? 'bg-white text-red-500 border-gray-200' : 'bg-white text-gray-400 hover:text-black border-gray-200 hover:border-gray-400 shadow-lg'))">
      <Icon :name="recording.isRecording ? 'stop' : 'microphone'" />
    </button>
    <div class="absolute top-full mt-4 px-3 py-1.5 rounded text-xs border opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-y-0 translate-y-[-4px] pointer-events-none whitespace-nowrap z-20"
         :class="app.theme === 'dark' ? 'bg-zinc-900 text-zinc-500 border-zinc-800' : 'bg-white text-gray-500 border-gray-200 shadow-sm'">
      Shortcut <kbd class="font-sans font-bold px-1.5 py-0.5 rounded ml-1 border"
                    :class="app.theme === 'dark' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-gray-100 text-gray-600 border-gray-200'">R</kbd>
    </div>
  </div>
</template>

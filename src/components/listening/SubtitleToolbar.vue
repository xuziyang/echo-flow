<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
</script>

<template>
  <div class="w-full max-w-3xl flex items-center justify-between py-2 gap-2">
    <div class="flex items-center gap-2">
      <button @click="transcript.isEditing ? transcript.cancelEdits() : transcript.enterEditMode()"
              class="transition-colors text-[11px] font-bold border px-2.5 py-1 rounded-md flex items-center gap-1.5"
              :class="transcript.isEditing
                 ? (app.theme === 'dark' ? 'bg-white text-black border-white' : 'bg-black text-white border-black')
                 : (app.theme === 'dark' ? 'text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white' : 'text-slate-600 border-gray-300 hover:border-gray-400 hover:text-black')">
        <Icon :name="transcript.isEditing ? 'xmark' : 'pen-to-square'" />
        <span>{{ transcript.isEditing ? '退出编辑' : '编辑字幕' }}</span>
      </button>
    </div>

    <div class="flex items-center gap-2">
      <button v-if="transcript.isEditing" @click="transcript.saveEdits()"
              class="transition-colors text-[11px] font-bold border px-2.5 py-1 rounded-md flex items-center gap-1.5"
              :class="transcript.hasUnsavedChanges
                 ? (app.theme === 'dark' ? 'bg-white text-black border-white' : 'bg-black text-white border-black')
                 : (app.theme === 'dark' ? 'text-gray-600 border-gray-800 cursor-not-allowed' : 'text-gray-300 border-gray-200 cursor-not-allowed')"
              :disabled="!transcript.hasUnsavedChanges">
        <Icon name="check" /> 保存
      </button>
      <button v-if="transcript.isEditing" @click="transcript.cancelEdits(); app.showSubtitleToast('已放弃未保存的字幕修改')"
              class="transition-colors text-[11px] font-bold border px-2.5 py-1 rounded-md"
              :class="app.theme === 'dark' ? 'text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white' : 'text-slate-500 border-gray-300 hover:border-gray-400 hover:text-black'">
        取消
      </button>

      <button @click="player.toggleEn()" class="transition-colors text-[11px] font-bold border px-2 py-1 rounded-md"
              :class="player.showEn
                 ? (app.theme === 'dark' ? 'bg-white text-black border-white' : 'bg-black text-white border-black')
                 : (app.theme === 'dark' ? 'text-gray-500 border-gray-700 hover:border-gray-500' : 'text-gray-400 border-gray-300 hover:border-gray-400')">
        EN
      </button>
    </div>
  </div>
</template>

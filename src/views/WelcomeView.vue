<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppStore } from '../stores/useAppStore'
import { useFilesStore } from '../stores/useFilesStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useModelDownloadStore } from '../stores/useModelDownloadStore'
import Icon from '../components/Icon.vue'

const app = useAppStore()
const files = useFilesStore()
const settings = useSettingsStore()
const modelDownload = useModelDownloadStore()

const dragOver = ref(false)
const lastFile = computed(() => files.files[0] ?? null)

const whisperReady = computed(() => modelDownload.isModelInstalled(settings.selectedWhisperModel))
const vadReady = computed(() => modelDownload.isModelInstalled('vad'))
const alignReady = computed(() => modelDownload.isModelInstalled('alignment'))
const micReady = computed(() => settings.audioInputDevices.length > 0)

const whisperLabel = computed(() => ({
  'whisper-tiny': 'Whisper Tiny',
  'whisper-base': 'Whisper Base',
  'whisper-small': 'Whisper Small',
  'whisper-medium': 'Whisper Medium',
}[settings.selectedWhisperModel] ?? 'Whisper Base'))

const AUDIO_EXT = /\.(mp3|wav|flac|ogg|aac|m4a)$/i

let unlistenDragDrop: (() => void) | null = null

onMounted(async () => {
  void modelDownload.checkModels()
  void settings.refreshAudioInputDevices()

  try {
    unlistenDragDrop = await getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        dragOver.value = true
      } else if (event.payload.type === 'leave') {
        dragOver.value = false
      } else if (event.payload.type === 'drop') {
        dragOver.value = false
        const path = event.payload.paths.find(p => AUDIO_EXT.test(p))
        if (path) void files.loadAudioFile(path)
      }
    })
  } catch {
    // 非 Tauri 环境（如纯浏览器调试）下忽略拖拽
  }
})

onUnmounted(() => {
  unlistenDragDrop?.()
})
</script>

<template>
  <div class="view animate-fade-in">
    <div class="welcome">
      <div class="dropzone" :class="{ dragover: dragOver }" @click="files.openFile()">
        <div style="color: var(--accent); margin-bottom: 12px; display: flex; justify-content: center">
          <Icon name="music" :size="30" :stroke-width="1.6" />
        </div>
        <div class="big">把英语音频拖到这里</div>
        <div>或</div>
        <button class="btn btn-primary" style="margin-top: 12px" @click.stop="files.openFile()">选择文件</button>
        <div style="margin-top: 12px; font-size: 12.5px">支持 mp3 / wav / flac / ogg / aac / m4a</div>
      </div>

      <div class="checklist">
        <div class="t">开始之前，需要一次性准备：</div>
        <div class="check-item">
          <span :class="whisperReady ? 'ok' : 'no'">{{ whisperReady ? '✓' : '☐' }}</span>
          识别模型（{{ whisperLabel }}）
          <span v-if="whisperReady" class="st">已就绪</span>
          <button v-else class="go" @click="app.openSettings('models')">去下载 →</button>
        </div>
        <div class="check-item">
          <span :class="vadReady ? 'ok' : 'no'">{{ vadReady ? '✓' : '☐' }}</span>
          语音检测模型
          <span v-if="vadReady" class="st">已就绪</span>
          <button v-else class="go" @click="app.openSettings('models')">去下载 →</button>
        </div>
        <div class="check-item">
          <span :class="alignReady ? 'ok' : 'no'">{{ alignReady ? '✓' : '☐' }}</span>
          时间对齐模型（378 MB）
          <span v-if="alignReady" class="st">已就绪</span>
          <button v-else class="go" @click="app.openSettings('models')">去下载 →</button>
        </div>
        <div class="check-item">
          <span :class="micReady ? 'ok' : 'no'">{{ micReady ? '✓' : '☐' }}</span>
          麦克风
          <span class="st">{{ micReady ? '已检测到' : '未检测到' }}</span>
        </div>
      </div>

      <div v-if="lastFile" class="recent">
        最近打开：<a @click="files.openRecentFile(lastFile)">{{ lastFile.title }}</a> · {{ lastFile.date }}
      </div>
    </div>
  </div>
</template>

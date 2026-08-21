<!-- src/views/SettingsView.vue -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore, type WhisperModelType } from '../stores/useSettingsStore'
import { useModelDownloadStore, type ModelType } from '../stores/useModelDownloadStore'
import Icon from '../components/Icon.vue'

type SettingsSection = 'general' | 'audio' | 'models' | 'appearance'

interface ModelOption {
  type: ModelType
  name: string
  size: string
  desc: string
}

const app = useAppStore()
const settings = useSettingsStore()
const modelDownload = useModelDownloadStore()
const activeSection = ref<SettingsSection>('general')
const appCacheDirectory = ref('')
const resolvedModelDirectory = ref('')

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'general', label: '常规' },
  { id: 'audio', label: '声音' },
  { id: 'models', label: '模型' },
  { id: 'appearance', label: '外观' },
]
const sectionIds = sections.map(s => s.id)

const whisperModels: Array<Omit<ModelOption, 'type'> & { type: WhisperModelType }> = [
  { type: 'whisper-tiny', name: 'Whisper Tiny', size: '75 MB', desc: '最快，精度较低' },
  { type: 'whisper-base', name: 'Whisper Base', size: '142 MB', desc: '推荐：速度与精度平衡' },
  { type: 'whisper-small', name: 'Whisper Small', size: '466 MB', desc: '更准，速度较慢' },
  { type: 'whisper-medium', name: 'Whisper Medium', size: '1.5 GB', desc: '最准，需要较好的电脑' },
]

const supportModels: ModelOption[] = [
  { type: 'vad', name: '语音检测', size: '1.8 MB', desc: '找出音频里有人在说话的部分' },
  { type: 'alignment', name: '时间对齐', size: '378 MB', desc: '把每句字幕对齐到精确时间' },
]

const currentSectionLabel = computed(() => (
  sections.find(section => section.id === activeSection.value)?.label ?? '设置'
))

let modelDirectoryCheckTimer: ReturnType<typeof setTimeout> | null = null
const bundleQueue = ref<ModelType[]>([])

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  app.closeSettings()
}

function requestDownload(type: ModelType) {
  void modelDownload.downloadModel(type).catch((error) => {
    app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
  })
}

function requestDelete(type: ModelType) {
  void modelDownload.deleteModel(type)
}

function requestCancelDownload() {
  bundleQueue.value = []
  void modelDownload.cancelDownload()
}

function setDefaultWhisperModel(type: WhisperModelType) {
  settings.selectedWhisperModel = type
}

/** 推荐配置一键下载：缺什么下什么，同时只下一个，自动排队 */
function downloadBundle() {
  const missing = (['whisper-base', 'vad', 'alignment'] as ModelType[])
    .filter(type => !modelDownload.isModelInstalled(type))
  if (!missing.length) {
    app.showSubtitleToast('推荐配置已全部安装 ✓')
    return
  }
  bundleQueue.value = missing
  app.showSubtitleToast(`开始下载 ${missing.length} 个模型（同时只下一个，自动排队）`)
  const [first] = bundleQueue.value
  if (!modelDownload.isDownloading && first) requestDownload(first)
}

watch(() => modelDownload.isDownloading, (isDownloading) => {
  if (isDownloading || bundleQueue.value.length === 0) return
  // 上一个下载结束（完成或失败），继续队列中的下一个
  bundleQueue.value.shift()
  const next = bundleQueue.value[0]
  if (next) requestDownload(next)
})

async function chooseModelFolder() {
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: settings.modelDirectory || undefined,
    canCreateDirectories: true,
  })

  if (typeof selected === 'string') {
    settings.modelDirectory = selected
  }
}

async function openModelFolder() {
  try {
    const modelFolder = await invoke<string>('ensure_model_dir', {
      modelDir: settings.modelDirectory || null,
    })
    await openPath(modelFolder)
  } catch (error) {
    app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
  }
}

async function loadCacheDirectories() {
  try {
    appCacheDirectory.value = await invoke<string>('get_app_cache_dir')
  } catch (error) {
    app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
  }
}

async function refreshResolvedModelDirectory() {
  try {
    resolvedModelDirectory.value = await invoke<string>('ensure_model_dir', {
      modelDir: settings.modelDirectory || null,
    })
  } catch (error) {
    app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
  }
}

async function openAppCacheFolder() {
  try {
    const folder = appCacheDirectory.value || await invoke<string>('get_app_cache_dir')
    appCacheDirectory.value = folder
    await openPath(folder)
  } catch (error) {
    app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
  }
}

watch(() => settings.modelDirectory, () => {
  if (modelDirectoryCheckTimer) clearTimeout(modelDirectoryCheckTimer)
  modelDirectoryCheckTimer = setTimeout(() => {
    void modelDownload.checkModels()
    void refreshResolvedModelDirectory()
    modelDirectoryCheckTimer = null
  }, 300)
})

watch(() => app.settingsTab, (tab) => {
  if (sectionIds.includes(tab as SettingsSection)) {
    activeSection.value = tab as SettingsSection
  }
}, { immediate: true })

onMounted(() => {
  void modelDownload.checkModels()
  void loadCacheDirectories()
  void refreshResolvedModelDirectory()
  void settings.refreshAudioInputDevices()
  void settings.refreshAudioOutputDevices()
  window.addEventListener('keydown', onKeydown, { capture: true })
})

onUnmounted(() => {
  if (modelDirectoryCheckTimer) clearTimeout(modelDirectoryCheckTimer)
  window.removeEventListener('keydown', onKeydown, { capture: true })
})
</script>

<template>
  <div class="overlay" @click.self="app.closeSettings()">
    <div class="settings" role="dialog" aria-modal="true" @click.stop>
      <nav class="set-nav">
        <button
          v-for="section in sections"
          :key="section.id"
          :class="{ active: activeSection === section.id }"
          @click="activeSection = section.id"
        >
          {{ section.label }}
        </button>
      </nav>

      <div class="set-body">
        <div class="set-head">
          <span class="t">设置 · {{ currentSectionLabel }}</span>
          <div class="spacer"></div>
          <button class="icon-btn" data-tip="关闭（Esc）" @click="app.closeSettings()">
            <Icon name="xmark" :size="15" :stroke-width="1.8" />
          </button>
        </div>

        <div class="set-content">
          <!-- 常规 -->
          <div v-show="activeSection === 'general'">
            <div class="field">
              <div class="lab">模型目录</div>
              <div class="rowline">
                <div class="path-box">{{ resolvedModelDirectory || settings.modelDirectory || '加载中…' }}</div>
                <button class="btn" @click="openModelFolder()">
                  <Icon name="folder" :size="14" :stroke-width="1.8" /> 打开文件夹
                </button>
                <button class="btn" @click="chooseModelFolder()">更换…</button>
              </div>
            </div>
            <div class="field">
              <div class="lab">缓存目录</div>
              <div class="rowline">
                <div class="path-box">{{ appCacheDirectory || '加载中…' }}</div>
                <button class="btn" @click="openAppCacheFolder()">
                  <Icon name="folder" :size="14" :stroke-width="1.8" /> 打开文件夹
                </button>
              </div>
            </div>
          </div>

          <!-- 声音 -->
          <div v-show="activeSection === 'audio'">
            <div class="field">
              <div class="lab">录音设备</div>
              <div class="desc">设备拔掉后自动回退到「系统默认」</div>
              <select v-model="settings.selectedInputId" class="dev">
                <option value="">系统默认 — 录音设备</option>
                <option v-if="settings.audioInputDevices.length === 0" value="" disabled>未检测到麦克风</option>
                <option v-for="device in settings.audioInputDevices" :key="device.deviceId" :value="device.deviceId">
                  {{ device.label }}
                </option>
              </select>
            </div>
            <div class="field">
              <div class="lab">播放设备</div>
              <div class="desc">设备拔掉后自动回退到「系统默认」</div>
              <select v-model="settings.selectedOutputId" class="dev">
                <option value="">系统默认 — 播放设备</option>
                <option v-if="settings.audioOutputDevices.length === 0" value="" disabled>未检测到扬声器</option>
                <option v-for="device in settings.audioOutputDevices" :key="device.deviceId" :value="device.deviceId">
                  {{ device.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- 模型 -->
          <div v-show="activeSection === 'models'">
            <div v-if="!modelDownload.isModelInstalled('alignment')" class="warn-strip">
              <Icon name="alert" :size="16" :stroke-width="1.8" style="flex: none" />
              还缺「时间对齐」模型，拆句后无法精确对齐时间（可先用估算时间）。
            </div>

            <div class="bundle">
              <div>
                <div class="t">推荐配置，一键下载</div>
                <div class="d">Base + 语音检测 + 时间对齐 · 缺什么下什么</div>
              </div>
              <div class="spacer"></div>
              <button class="btn btn-primary" :disabled="modelDownload.isDownloading" @click="downloadBundle">
                <Icon name="download" :size="14" :stroke-width="1.8" /> 全部下载
              </button>
            </div>

            <div class="field">
              <div class="lab">
                Whisper 识别模型
                <span style="font-weight: 400; color: var(--text2); font-size: 12.5px">（单选设为默认）</span>
              </div>
              <div>
                <div v-for="model in whisperModels" :key="model.type" class="model-row">
                  <input
                    type="radio"
                    name="whisper-model"
                    :checked="settings.selectedWhisperModel === model.type"
                    :disabled="!modelDownload.isModelInstalled(model.type)"
                    :data-tip="modelDownload.isModelInstalled(model.type) ? null : '安装后才能设为默认'"
                    @change="setDefaultWhisperModel(model.type)"
                  >
                  <span class="info">
                    <span class="n">{{ model.name }}<span class="sz">{{ model.size }}</span></span>
                    <span class="d">{{ model.desc }}</span>
                  </span>
                  <span
                    v-if="modelDownload.isModelInstalled(model.type)"
                    class="m-status"
                    :class="{ default: settings.selectedWhisperModel === model.type }"
                  >
                    {{ settings.selectedWhisperModel === model.type ? '已安装 · 默认' : '✓ 已安装' }}
                  </span>
                  <div v-if="modelDownload.downloadingType === model.type" class="m-dl">
                    <div class="meter"><i :style="{ width: `${modelDownload.downloadProgressPercent}%` }"></i></div>
                    <div class="row">
                      <span class="pct">{{ modelDownload.downloadProgressPercent.toFixed(0) }}%</span>
                      <button class="btn" style="padding: 3px 9px; font-size: 12px" @click="requestCancelDownload()">取消</button>
                    </div>
                  </div>
                  <button
                    v-else-if="!modelDownload.isModelInstalled(model.type)"
                    class="btn"
                    style="padding: 5px 10px; font-size: 12.5px"
                    :disabled="modelDownload.isDownloading"
                    :data-tip="modelDownload.isDownloading ? '同时只下载一个，请稍候' : null"
                    @click="requestDownload(model.type)"
                  >
                    <Icon name="download" :size="13" :stroke-width="1.8" /> 下载
                  </button>
                  <button
                    v-else
                    class="btn"
                    style="padding: 5px 10px; font-size: 12.5px"
                    @click="requestDelete(model.type)"
                  >
                    <Icon name="trash" :size="13" :stroke-width="1.8" /> 删除
                  </button>
                </div>
              </div>
            </div>

            <div class="field">
              <div class="lab">辅助模型</div>
              <div>
                <div v-for="model in supportModels" :key="model.type" class="model-row">
                  <span class="info">
                    <span class="n">{{ model.name }}<span class="sz">{{ model.size }}</span></span>
                    <span class="d">{{ model.desc }}</span>
                  </span>
                  <span v-if="modelDownload.isModelInstalled(model.type)" class="m-status">✓ 已安装</span>
                  <div v-if="modelDownload.downloadingType === model.type" class="m-dl">
                    <div class="meter"><i :style="{ width: `${modelDownload.downloadProgressPercent}%` }"></i></div>
                    <div class="row">
                      <span class="pct">{{ modelDownload.downloadProgressPercent.toFixed(0) }}%</span>
                      <button class="btn" style="padding: 3px 9px; font-size: 12px" @click="requestCancelDownload()">取消</button>
                    </div>
                  </div>
                  <button
                    v-else-if="!modelDownload.isModelInstalled(model.type)"
                    class="btn"
                    style="padding: 5px 10px; font-size: 12.5px"
                    :disabled="modelDownload.isDownloading"
                    :data-tip="modelDownload.isDownloading ? '同时只下载一个，请稍候' : null"
                    @click="requestDownload(model.type)"
                  >
                    <Icon name="download" :size="13" :stroke-width="1.8" /> 下载
                  </button>
                  <button
                    v-else
                    class="btn"
                    style="padding: 5px 10px; font-size: 12.5px"
                    @click="requestDelete(model.type)"
                  >
                    <Icon name="trash" :size="13" :stroke-width="1.8" /> 删除
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 外观 -->
          <div v-show="activeSection === 'appearance'">
            <div class="field">
              <div class="lab">主题</div>
              <div class="rowline">
                <button class="btn" :class="{ 'btn-primary': app.theme === 'dark' }" @click="app.theme = 'dark'">
                  ☾ 深色（推荐长时间练习）
                </button>
                <button class="btn" :class="{ 'btn-primary': app.theme === 'light' }" @click="app.theme = 'light'">
                  ☀ 浅色
                </button>
              </div>
            </div>
            <div class="field">
              <div class="lab">字体</div>
              <div class="desc">
                全站文字使用「霞鹜文楷 Lite」（LXGW WenKai Lite，SIL OFL 1.1 开源授权），
                中文 / 英文 / 数字统一楷体质感，通过 CDN 按字符分片加载。
              </div>
            </div>
          </div>
        </div>

        <div class="set-foot">
          <button class="btn btn-primary" @click="app.closeSettings()">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

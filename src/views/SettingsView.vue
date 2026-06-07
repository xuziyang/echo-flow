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

type SettingsSection = 'general' | 'audio' | 'downloads'

interface ModelOption {
  type: ModelType
  name: string
}

interface WhisperModelOption {
  type: WhisperModelType
  name: string
}

const app = useAppStore()
const settings = useSettingsStore()
const modelDownload = useModelDownloadStore()
const activeSection = ref<SettingsSection>('general')

const sections: Array<{
  id: SettingsSection
  label: string
  icon: string
}> = [
  {
    id: 'general',
    label: 'General',
    icon: 'gear',
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'microphone',
  },
  {
    id: 'downloads',
    label: 'Model Downloads',
    icon: 'download',
  },
]

const whisperModels: WhisperModelOption[] = [
  { type: 'whisper-tiny', name: 'Tiny (75MB)' },
  { type: 'whisper-base', name: 'Base (142MB)' },
  { type: 'whisper-small', name: 'Small (466MB)' },
  { type: 'whisper-medium', name: 'Medium (1.5GB)' },
]

const supportModels: ModelOption[] = [
  { type: 'vad', name: 'Silero VAD (1.8MB)' },
  { type: 'alignment', name: 'Wav2Vec2 (378MB)' },
]

const currentSection = computed(() => sections.find((section) => section.id === activeSection.value) ?? sections[0])

let modelDirectoryCheckTimer: ReturnType<typeof setTimeout> | null = null

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  app.closeSettings()
}

function requestDownload(type: ModelType) {
  void modelDownload.downloadModel(type)
}

function requestDelete(type: ModelType) {
  void modelDownload.deleteModel(type)
}

function requestCancelDownload() {
  void modelDownload.cancelDownload()
}

function setDefaultWhisperModel(type: WhisperModelType) {
  settings.selectedWhisperModel = type
}

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

watch(() => settings.modelDirectory, () => {
  if (modelDirectoryCheckTimer) clearTimeout(modelDirectoryCheckTimer)
  modelDirectoryCheckTimer = setTimeout(() => {
    void modelDownload.checkModels()
    modelDirectoryCheckTimer = null
  }, 300)
})

onMounted(() => {
  void modelDownload.checkModels()
  window.addEventListener('keydown', onKeydown, { capture: true })
})

onUnmounted(() => {
  if (modelDirectoryCheckTimer) clearTimeout(modelDirectoryCheckTimer)
  window.removeEventListener('keydown', onKeydown, { capture: true })
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    :class="app.theme === 'dark' ? 'bg-black/60 text-dark-text' : 'bg-zinc-950/30 text-light-text'"
    @click.self="app.closeSettings()"
  >
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      class="flex h-[min(720px,calc(100vh-48px))] w-full max-w-[860px] overflow-hidden rounded-lg border shadow-2xl"
      :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-white border-light-border'"
      @click.stop
    >
      <aside
        class="hidden w-60 flex-shrink-0 border-r p-3 sm:block"
        :class="app.theme === 'dark' ? 'border-dark-border bg-dark-bg/60' : 'border-light-border bg-zinc-50'"
      >
        <div class="px-2 py-3">
          <h2
            id="settings-title"
            class="text-base font-medium"
            :class="app.theme === 'dark' ? 'text-white' : 'text-zinc-950'"
          >
            Settings
          </h2>
        </div>

        <nav class="mt-3 space-y-1" aria-label="Settings sections">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm font-medium transition-colors"
            :class="activeSection === section.id
              ? (app.theme === 'dark' ? 'bg-white/10 text-white' : 'bg-zinc-900 text-white')
              : (app.theme === 'dark' ? 'text-dark-subtext hover:bg-white/5 hover:text-white' : 'text-light-subtext hover:bg-zinc-100 hover:text-zinc-950')"
            @click="activeSection = section.id"
          >
            <Icon :name="section.icon" />
            <span class="min-w-0 truncate">{{ section.label }}</span>
          </button>
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="flex flex-shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6"
          :class="app.theme === 'dark' ? 'border-dark-border' : 'border-light-border'"
        >
          <div class="min-w-0">
            <h2
              class="text-base font-medium"
              :class="app.theme === 'dark' ? 'text-white' : 'text-zinc-950'"
            >
              {{ currentSection.label }}
            </h2>
          </div>

          <button
            type="button"
            class="rounded p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
            :class="app.theme === 'dark' ? 'text-dark-subtext hover:bg-white/10 hover:text-white' : 'text-light-subtext hover:bg-zinc-100 hover:text-zinc-950'"
            aria-label="Close settings"
            @click="app.closeSettings()"
          >
            <Icon name="xmark" />
          </button>
        </header>

        <div class="border-b px-5 py-3 sm:hidden" :class="app.theme === 'dark' ? 'border-dark-border' : 'border-light-border'">
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="section in sections"
              :key="section.id"
              type="button"
              class="flex items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition-colors"
              :class="activeSection === section.id
                ? (app.theme === 'dark' ? 'bg-white/10 text-white' : 'bg-zinc-900 text-white')
                : (app.theme === 'dark' ? 'text-dark-subtext hover:bg-white/5 hover:text-white' : 'text-light-subtext hover:bg-zinc-100 hover:text-zinc-950')"
              @click="activeSection = section.id"
            >
              <Icon :name="section.icon" :size="14" />
              <span class="truncate">{{ section.label }}</span>
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div v-if="activeSection === 'general'" class="space-y-5">
            <section
              class="overflow-hidden rounded-lg border"
              :class="app.theme === 'dark' ? 'border-dark-border bg-dark-bg/40' : 'border-light-border bg-zinc-50'"
            >
              <div class="flex items-center gap-4 px-5 py-5">
                <Icon
                  name="box"
                  class="flex-shrink-0"
                  :size="24"
                  :class="app.theme === 'dark' ? 'text-white' : 'text-zinc-950'"
                />
                <div class="min-w-0 flex-1">
                  <h3
                    class="truncate text-sm font-medium"
                    :class="app.theme === 'dark' ? 'text-white' : 'text-zinc-950'"
                  >
                    Model Folder
                  </h3>
                  <p
                    class="mt-1 truncate text-xs"
                    :class="app.theme === 'dark' ? 'text-dark-subtext' : 'text-slate-500'"
                  >
                    {{ settings.modelDirectory || 'Default folder' }}
                  </p>
                </div>
                <button
                  type="button"
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border shadow-sm transition-colors"
                  :class="app.theme === 'dark'
                    ? 'border-gray-700 bg-dark-card text-white hover:bg-white/10'
                    : 'border-slate-200 bg-white text-zinc-950 hover:bg-slate-50'"
                  aria-label="Open Folder"
                  title="Open Folder"
                  @click="openModelFolder()"
                >
                  <Icon name="folder" :size="20" />
                </button>
                <button
                  type="button"
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border shadow-sm transition-colors"
                  :class="app.theme === 'dark'
                    ? 'border-gray-700 bg-dark-card text-white hover:bg-white/10'
                    : 'border-slate-200 bg-white text-zinc-950 hover:bg-slate-50'"
                  aria-label="Change"
                  title="Change"
                  @click="chooseModelFolder()"
                >
                  <Icon name="gear" :size="20" />
                </button>
              </div>
            </section>
          </div>

          <div v-else-if="activeSection === 'audio'" class="space-y-5">
            <section
              class="rounded-lg border p-4"
              :class="app.theme === 'dark' ? 'border-dark-border bg-dark-bg/40' : 'border-light-border bg-zinc-50'"
            >
              <label
                class="block text-xs font-medium"
                :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'"
              >
                Microphone (Input)
              </label>
              <div class="relative mt-3">
                <select
                  v-model="settings.selectedInputId"
                  class="w-full appearance-none rounded-lg border p-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
                  :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'"
                >
                  <option v-if="settings.audioInputDevices.length === 0" value="">No microphones found</option>
                  <option v-for="device in settings.audioInputDevices" :key="device.deviceId" :value="device.deviceId">
                    {{ device.label || `Microphone ${device.deviceId.slice(0, 5)}...` }}
                  </option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <Icon name="microphone" class="text-xs" />
                </div>
              </div>
            </section>

            <section
              v-if="settings.audioOutputDevices.length > 0"
              class="rounded-lg border p-4"
              :class="app.theme === 'dark' ? 'border-dark-border bg-dark-bg/40' : 'border-light-border bg-zinc-50'"
            >
              <label
                class="block text-xs font-medium"
                :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'"
              >
                Speakers (Output)
              </label>
              <div class="relative mt-3">
                <select
                  v-model="settings.selectedOutputId"
                  class="w-full appearance-none rounded-lg border p-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-brand-500"
                  :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'"
                >
                  <option v-for="device in settings.audioOutputDevices" :key="device.deviceId" :value="device.deviceId">
                    {{ device.label || `Speaker ${device.deviceId.slice(0, 5)}...` }}
                  </option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <Icon name="volume-high" class="text-xs" />
                </div>
              </div>
            </section>
          </div>

          <div v-else class="space-y-5">
            <section
              class="rounded-lg border p-4"
              :class="app.theme === 'dark' ? 'border-dark-border bg-dark-bg/40' : 'border-light-border bg-zinc-50'"
            >
              <h3
                class="text-xs font-medium"
                :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'"
              >
                Whisper Models
              </h3>
              <div class="mt-3 space-y-2">
                <div
                  v-for="model in whisperModels"
                  :key="model.type"
                  class="flex items-center justify-between gap-3 rounded-lg p-3"
                  :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-white'"
                >
                  <span class="text-xs" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">{{ model.name }}</span>
                  <div class="flex items-center gap-2">
                    <span
                      v-if="modelDownload.isModelInstalled(model.type) && settings.selectedWhisperModel === model.type"
                      class="rounded bg-sky-500/15 px-2 py-1 text-xs text-sky-500 ring-1 ring-sky-500/25"
                    >
                      Default
                    </span>
                    <button
                      v-else-if="modelDownload.isModelInstalled(model.type)"
                      type="button"
                      class="rounded-md px-3 py-1 text-xs transition-colors"
                      :class="app.theme === 'dark' ? 'text-dark-subtext hover:bg-white/10 hover:text-white' : 'text-light-subtext hover:bg-zinc-100 hover:text-zinc-950'"
                      @click="setDefaultWhisperModel(model.type)"
                    >
                      Set default
                    </button>
                    <span v-if="modelDownload.isModelInstalled(model.type)" class="text-xs text-green-500">Installed</span>
                    <button
                      v-if="modelDownload.downloadingType === model.type"
                      type="button"
                      class="rounded-md px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-100"
                      @click="requestCancelDownload()"
                    >
                      Cancel
                    </button>
                    <button
                      v-else-if="!modelDownload.isModelInstalled(model.type)"
                      type="button"
                      :disabled="modelDownload.isDownloading"
                      class="rounded-md bg-brand-500 px-3 py-1 text-xs text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                      @click="requestDownload(model.type)"
                    >
                      Download
                    </button>
                    <button
                      v-else
                      type="button"
                      class="rounded-md px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-100"
                      @click="requestDelete(model.type)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section
              class="rounded-lg border p-4"
              :class="app.theme === 'dark' ? 'border-dark-border bg-dark-bg/40' : 'border-light-border bg-zinc-50'"
            >
              <h3
                class="text-xs font-medium"
                :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'"
              >
                Support Models
              </h3>
              <div class="mt-3 space-y-2">
                <div
                  v-for="model in supportModels"
                  :key="model.type"
                  class="flex items-center justify-between gap-3 rounded-lg p-3"
                  :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-white'"
                >
                  <span class="text-xs" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">{{ model.name }}</span>
                  <div class="flex items-center gap-2">
                    <span v-if="modelDownload.isModelInstalled(model.type)" class="text-xs text-green-500">Installed</span>
                    <button
                      v-if="modelDownload.downloadingType === model.type"
                      type="button"
                      class="rounded-md px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-100"
                      @click="requestCancelDownload()"
                    >
                      Cancel
                    </button>
                    <button
                      v-else-if="!modelDownload.isModelInstalled(model.type)"
                      type="button"
                      :disabled="modelDownload.isDownloading"
                      class="rounded-md bg-brand-500 px-3 py-1 text-xs text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                      @click="requestDownload(model.type)"
                    >
                      Download
                    </button>
                    <button
                      v-else
                      type="button"
                      class="rounded-md px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-100"
                      @click="requestDelete(model.type)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section
              v-if="modelDownload.isDownloading"
              class="rounded-lg border p-4"
              :class="app.theme === 'dark' ? 'border-gray-700 bg-dark-bg' : 'border-gray-200 bg-gray-50'"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Downloading...</span>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-gray-500">{{ modelDownload.downloadProgressPercent.toFixed(0) }}%</span>
                  <button
                    type="button"
                    class="rounded-md px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-100"
                    @click="requestCancelDownload()"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full" :class="app.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'">
                <div
                  class="h-full bg-brand-500 transition-all duration-300"
                  :style="{ width: `${modelDownload.downloadProgressPercent}%` }"
                ></div>
              </div>
            </section>
          </div>
        </div>

        <footer
          class="flex flex-shrink-0 justify-end border-t px-5 py-4 sm:px-6"
          :class="app.theme === 'dark' ? 'border-dark-border' : 'border-light-border'"
        >
          <button
            type="button"
            class="rounded-lg px-6 py-2 font-medium transition-colors"
            :class="app.theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'"
            @click="app.closeSettings()"
          >
            Done
          </button>
        </footer>
      </div>
    </section>
  </div>
</template>

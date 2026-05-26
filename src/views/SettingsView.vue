<!-- src/views/SettingsView.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useModelDownloadStore } from '../stores/useModelDownloadStore'
import Icon from '../components/Icon.vue'

const app = useAppStore()
const settings = useSettingsStore()
const modelDownload = useModelDownloadStore()

const whisperModels = [
  { type: 'whisper-tiny' as const, name: 'Tiny (75MB)' },
  { type: 'whisper-base' as const, name: 'Base (142MB)' },
  { type: 'whisper-small' as const, name: 'Small (466MB)' },
  { type: 'whisper-medium' as const, name: 'Medium (1.5GB)' },
]

onMounted(() => {
  modelDownload.checkModels()
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden items-center justify-center relative transition-colors duration-500"
       :class="app.theme === 'dark' ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'">
    <div class="w-full max-w-lg p-8 rounded-2xl border shadow-2xl relative"
         :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">

      <!-- Close Button -->
      <button @click="app.closeSettings()"
              class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none">
        <Icon name="xmark" class="text-xl" />
      </button>

      <h2 class="text-2xl font-bold mb-6" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Settings</h2>

      <div class="space-y-6">
        <!-- Input Device -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Microphone (Input)</label>
          <div class="relative">
            <select v-model="settings.selectedInputId"
                    class="w-full p-3 rounded-lg border appearance-none focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'">
              <option v-if="settings.audioInputDevices.length === 0" value="">No microphones found</option>
              <option v-for="device in settings.audioInputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label || `Microphone ${device.deviceId.slice(0,5)}...` }}
              </option>
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
              <Icon name="microphone" class="text-xs" />
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">Select the device you want to use for recording your voice.</p>
        </div>

        <!-- Output Device -->
        <div v-if="settings.audioOutputDevices.length > 0">
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Speakers (Output)</label>
          <div class="relative">
            <select v-model="settings.selectedOutputId"
                    class="w-full p-3 rounded-lg border appearance-none focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'">
              <option v-for="device in settings.audioOutputDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label || `Speaker ${device.deviceId.slice(0,5)}...` }}
              </option>
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
              <Icon name="volume-high" class="text-xs" />
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">Note: Output device selection depends on browser support.</p>
        </div>

        <!-- Model Directory -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Model Directory</label>
          <input v-model="settings.modelDirectory"
                 type="text"
                 placeholder="/home/user/.cache/echo-flow/models"
                 class="w-full p-3 rounded-lg border focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                 :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-black placeholder-gray-400'" />
          <p class="mt-2 text-xs text-gray-500">Custom directory for AI models (Whisper, VAD, Aligner). Use ~ for home directory. Leave empty to use default.</p>
        </div>

        <!-- Model Downloads -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Whisper Models</label>
          <div class="space-y-2">
            <div v-for="model in whisperModels"
                 :key="model.type"
                 class="flex items-center justify-between p-2 rounded-lg"
                 :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-gray-50'">
              <span class="text-sm" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">{{ model.name }}</span>
              <div class="flex items-center gap-2">
                <span v-if="modelDownload.isModelInstalled(model.type)"
                      class="text-xs text-green-500">Installed</span>
                <button v-if="!modelDownload.isModelInstalled(model.type)"
                        @click="modelDownload.downloadModel(model.type)"
                        :disabled="modelDownload.isDownloading"
                        class="px-3 py-1 text-xs rounded-md transition-colors"
                        :class="app.theme === 'dark' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-brand-500 text-white hover:bg-brand-600'">
                  Download
                </button>
                <button v-else
                        @click="modelDownload.deleteModel(model.type)"
                        class="px-3 py-1 text-xs rounded-md transition-colors text-red-500 hover:bg-red-100">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- VAD Model -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">VAD Model</label>
          <div class="flex items-center justify-between p-2 rounded-lg"
               :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-gray-50'">
            <span class="text-sm" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Silero VAD (1.8MB)</span>
            <div class="flex items-center gap-2">
              <span v-if="modelDownload.isModelInstalled('vad')"
                    class="text-xs text-green-500">Installed</span>
              <button v-if="!modelDownload.isModelInstalled('vad')"
                      @click="modelDownload.downloadModel('vad')"
                      :disabled="modelDownload.isDownloading"
                      class="px-3 py-1 text-xs rounded-md transition-colors"
                      :class="app.theme === 'dark' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-brand-500 text-white hover:bg-brand-600'">
                Download
              </button>
              <button v-else
                      @click="modelDownload.deleteModel('vad')"
                      class="px-3 py-1 text-xs rounded-md transition-colors text-red-500 hover:bg-red-100">
                Delete
              </button>
            </div>
          </div>
        </div>

        <!-- Alignment Model -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Alignment Model</label>
          <div class="flex items-center justify-between p-2 rounded-lg"
               :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-gray-50'">
            <span class="text-sm" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Wav2Vec2 (378MB)</span>
            <div class="flex items-center gap-2">
              <span v-if="modelDownload.isModelInstalled('alignment')"
                    class="text-xs text-green-500">Installed</span>
              <button v-if="!modelDownload.isModelInstalled('alignment')"
                      @click="modelDownload.downloadModel('alignment')"
                      :disabled="modelDownload.isDownloading"
                      class="px-3 py-1 text-xs rounded-md transition-colors"
                      :class="app.theme === 'dark' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-brand-500 text-white hover:bg-brand-600'">
                Download
              </button>
              <button v-else
                      @click="modelDownload.deleteModel('alignment')"
                      class="px-3 py-1 text-xs rounded-md transition-colors text-red-500 hover:bg-red-100">
                Delete
              </button>
            </div>
          </div>
        </div>

        <!-- Download Progress -->
        <div v-if="modelDownload.isDownloading" class="p-3 rounded-lg border"
             :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700' : 'bg-gray-50 border-gray-200'">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Downloading...</span>
            <span class="text-xs text-gray-500">{{ modelDownload.downloadProgressPercent.toFixed(0) }}%</span>
          </div>
          <div class="w-full h-2 rounded-full overflow-hidden"
               :class="app.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'">
            <div class="h-full bg-brand-500 transition-all duration-300"
                 :style="{ width: `${modelDownload.downloadProgressPercent}%` }"></div>
          </div>
        </div>
      </div>

      <div class="mt-8 pt-6 border-t flex justify-end" :class="app.theme === 'dark' ? 'border-gray-800' : 'border-gray-200'">
        <button @click="app.closeSettings()"
                class="px-6 py-2 rounded-lg font-medium transition-colors"
                :class="app.theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'">
          Done
        </button>
      </div>
    </div>
  </div>
</template>

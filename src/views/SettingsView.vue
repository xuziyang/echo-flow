<!-- src/views/SettingsView.vue -->
<script setup lang="ts">
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'

const app = useAppStore()
const settings = useSettingsStore()
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden items-center justify-center relative transition-colors duration-500"
       :class="app.theme === 'dark' ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'">
    <div class="w-full max-w-lg p-8 rounded-2xl border shadow-2xl relative"
         :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">

      <!-- Close Button -->
      <button @click="app.closeSettings()"
              class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none">
        <i class="fa-solid fa-xmark text-xl"></i>
      </button>

      <h2 class="text-2xl font-bold mb-6" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Settings</h2>

      <div class="space-y-6">
        <!-- Interface Language -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Interface Language</label>
          <div class="relative">
            <select v-model="settings.selectedLanguage"
                    class="w-full p-3 rounded-lg border appearance-none focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'">
              <option v-for="lang in settings.languages" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
              <i class="fa-solid fa-globe text-xs"></i>
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">Choose your preferred language for the application interface.</p>
        </div>

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
              <i class="fa-solid fa-microphone text-xs"></i>
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
              <i class="fa-solid fa-volume-high text-xs"></i>
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">Note: Output device selection depends on browser support.</p>
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

<script setup lang="ts">
import { useAppStore } from './stores/useAppStore'
import { usePlaybackSync } from './composables/usePlaybackSync'
import { useTranscribeEvents } from './composables/useTranscribeEvents'
import { useWaveformPreviewEvents } from './composables/useWaveformPreviewEvents'
import { useDownloadEvents } from './composables/useDownloadEvents'
import { useAudioDeviceEvents } from './composables/useAudioDeviceEvents'
import { useAudioStreamEvents } from './composables/useAudioStreamEvents'
import TitleBar from './components/layout/TitleBar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import SubtitleToast from './components/layout/SubtitleToast.vue'
import ListeningView from './components/listening/ListeningView.vue'
import ShadowingView from './components/shadowing/ShadowingView.vue'
import SettingsView from './views/SettingsView.vue'

const app = useAppStore()
usePlaybackSync()
useTranscribeEvents()
useWaveformPreviewEvents()
useDownloadEvents()
useAudioDeviceEvents()
useAudioStreamEvents()
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col select-none transition-colors duration-300"
       :class="[
         app.theme === 'dark' ? 'text-dark-text bg-dark-bg' : 'text-light-text bg-light-bg',
         app.theme
       ]">
    <TitleBar />
    <div class="flex-1 flex overflow-hidden relative w-full">
      <AppSidebar />
      <main class="flex-1 flex overflow-hidden relative">
        <ListeningView v-if="app.mode === 'listening'" />
        <ShadowingView v-if="app.mode === 'shadowing'" />
      </main>
    </div>
    <SettingsView v-if="app.isSettingsOpen" />
    <SubtitleToast />
  </div>
</template>

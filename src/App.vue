<script setup lang="ts">
import { useAppStore } from './stores/useAppStore'
import { usePlayerStore } from './stores/usePlayerStore'
import { usePlaybackSync } from './composables/usePlaybackSync'
import { useTranscribeEvents } from './composables/useTranscribeEvents'
import { useWaveformPreviewEvents } from './composables/useWaveformPreviewEvents'
import { useDownloadEvents } from './composables/useDownloadEvents'
import { useAudioDeviceEvents } from './composables/useAudioDeviceEvents'
import { useAudioStreamEvents } from './composables/useAudioStreamEvents'
import TitleBar from './components/layout/TitleBar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import SubtitleToast from './components/layout/SubtitleToast.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import WelcomeView from './views/WelcomeView.vue'
import ListeningView from './components/listening/ListeningView.vue'
import ShadowingView from './components/shadowing/ShadowingView.vue'
import ShadowingScriptFlow from './components/shadowing/ShadowingScriptFlow.vue'
import SettingsView from './views/SettingsView.vue'

const app = useAppStore()
const player = usePlayerStore()
usePlaybackSync()
useTranscribeEvents()
useWaveformPreviewEvents()
useDownloadEvents()
useAudioDeviceEvents()
useAudioStreamEvents()
</script>

<template>
  <div class="app-root h-screen w-screen overflow-hidden flex flex-col select-none" :class="app.theme">
    <TitleBar />
    <div class="main">
      <AppSidebar />
      <main class="workspace">
        <WelcomeView v-if="!player.currentPath" />
        <ListeningView v-else-if="app.mode === 'listening'" />
        <ShadowingView v-else />
      </main>
      <ShadowingScriptFlow />
    </div>
    <StatusBar />
    <SettingsView v-if="app.isSettingsOpen" />
    <ConfirmDialog />
    <SubtitleToast />
  </div>
</template>

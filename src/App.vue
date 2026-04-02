<script setup lang="ts">
import { useAppStore } from './stores/useAppStore'
import TitleBar from './components/layout/TitleBar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import SubtitleToast from './components/layout/SubtitleToast.vue'
import ListeningView from './components/listening/ListeningView.vue'
import ShadowingView from './components/shadowing/ShadowingView.vue'
import SettingsView from './views/SettingsView.vue'

const app = useAppStore()
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col select-none"
       :class="app.theme === 'dark' ? 'text-dark-text' : 'text-light-text'">
    <TitleBar />
    <div class="flex-1 flex overflow-hidden relative w-full">
      <AppSidebar />
      <main class="flex-1 flex overflow-hidden relative transition-colors duration-300"
            :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-light-bg'">
        <ListeningView v-if="app.mode === 'listening'" />
        <ShadowingView v-if="app.mode === 'shadowing'" />
        <SettingsView v-if="app.mode === 'settings'" />
      </main>
    </div>
    <SubtitleToast />
  </div>
</template>

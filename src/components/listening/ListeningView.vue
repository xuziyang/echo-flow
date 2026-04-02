<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import PlayerCard from './PlayerCard.vue'
import SubtitleToolbar from './SubtitleToolbar.vue'
import SubtitleList from './SubtitleList.vue'
import Icon from '../Icon.vue'

const app = useAppStore()
</script>

<template>
  <div class="flex-1 flex flex-col h-full w-full relative transition-colors duration-500"
       :class="app.theme === 'dark' ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'">
    <!-- Player Header -->
    <header class="h-16 flex items-center justify-between px-8 flex-shrink-0 z-10">
      <div class="flex items-center gap-4 ml-8">
        <button @click="app.toggleSidebar()"
                class="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                :class="app.theme === 'dark' ? 'bg-dark-card hover:bg-dark-hover text-white' : 'bg-light-card hover:bg-light-hover text-black'">
          <Icon :name="app.showSidebar ? 'outdent' : 'indent'" class="text-sm" />
        </button>
        <h2 class="font-semibold text-lg tracking-tight" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">
          {{ app.currentTitle }}
        </h2>
      </div>
    </header>

    <!-- Listening Mode Content -->
    <div class="flex-1 flex flex-col items-center overflow-hidden animate-fade-in pt-4 pb-10 px-8">
      <PlayerCard />
      <SubtitleToolbar />
      <SubtitleList />

      <!-- Bottom CTA -->
      <div class="w-full max-w-3xl mt-4 flex-shrink-0 z-20">
        <button @click="app.switchMode('shadowing')"
                class="w-full font-medium py-2.5 rounded border border-transparent transition-all hover:translate-y-[-1px] flex items-center justify-center gap-2 group tracking-wide"
                :class="app.theme === 'dark' ? 'bg-zinc-100 hover:bg-white text-black' : 'bg-black hover:bg-gray-800 text-white'">
          Start Speaking Practice
          <Icon name="microphone" class="transition-colors" :class="app.theme === 'dark' ? 'group-hover:text-red-500' : 'group-hover:text-red-400'" />
        </button>
      </div>
    </div>
  </div>
</template>

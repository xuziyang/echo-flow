<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import PlayerCard from './PlayerCard.vue'
import SubtitleToolbar from './SubtitleToolbar.vue'
import SubtitleList from './SubtitleList.vue'
import Icon from '../Icon.vue'

const app = useAppStore()
const player = usePlayerStore()

function onKeydown(e: KeyboardEvent) {
  if (e.code !== 'Space') return
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  e.preventDefault()
  player.togglePlay()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex-1 flex flex-col h-full w-full relative transition-colors duration-500"
       :class="app.theme === 'dark' ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'">
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

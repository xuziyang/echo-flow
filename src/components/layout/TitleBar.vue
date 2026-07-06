<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { platform } from '@tauri-apps/plugin-os'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppStore } from '../../stores/useAppStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const isWindows = ref(platform() === 'windows')
const isMaximized = ref(false)

const win = getCurrentWindow()

function startDrag() {
  win.startDragging()
}

async function updateMaximized() {
  isMaximized.value = await win.isMaximized()
}

function minimize() {
  win.minimize()
}

function toggleMaximize() {
  win.toggleMaximize()
}

function close() {
  win.close()
}

let unlisten: (() => void) | null = null

onMounted(async () => {
  await updateMaximized()
  unlisten = await win.onResized(updateMaximized)
})

onUnmounted(() => {
  unlisten?.()
})
</script>

<template>
  <div class="flex-shrink-0 flex items-center justify-between px-5 select-none transition-colors duration-300 border-b"
       :class="[
         app.theme === 'dark' ? 'text-gray-400 border-gray-800/50' : 'text-gray-500 border-gray-200'
       ]"
       style="padding-top: env(safe-area-inset-top); height: calc(32px + env(safe-area-inset-top))"
       @mousedown="startDrag">
    <div class="flex-1 h-full" />

    <!-- Center: global actions -->
    <div class="flex gap-4 text-xs opacity-60 items-center" @mousedown.stop>
      <button @click="app.toggleTheme()" class="hover:text-brand-500 cursor-pointer transition-colors focus:outline-none" title="Toggle theme">
        <Icon :name="app.theme === 'dark' ? 'sun' : 'moon'" />
      </button>
      <button @click="app.openSettings()" class="hover:text-brand-500 cursor-pointer transition-colors focus:outline-none" title="Settings">
        <Icon name="gear" />
      </button>
      <button class="hover:text-brand-500 cursor-pointer transition-colors focus:outline-none" title="Notifications">
        <Icon name="bell" />
      </button>
    </div>

    <!-- Right: window controls on Windows -->
    <div v-if="isWindows" class="flex items-center h-full -mr-5 ml-4" @mousedown.stop>
      <button @click="minimize"
              class="h-full w-10 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none"
              title="Minimize">
        <Icon name="minus" :size="14" />
      </button>
      <button @click="toggleMaximize"
              class="h-full w-10 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none"
              :title="isMaximized ? 'Restore' : 'Maximize'">
        <Icon :name="isMaximized ? 'copy' : 'square'" :size="12" />
      </button>
      <button @click="close"
              class="h-full w-10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors focus:outline-none"
              title="Close">
        <Icon name="xmark" :size="14" />
      </button>
    </div>
  </div>
</template>

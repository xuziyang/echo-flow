<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Icon from '../Icon.vue'

const app = useAppStore()

function startDrag() {
  getCurrentWindow().startDragging()
}
</script>

<template>
  <div class="flex-shrink-0 flex items-center justify-end px-5 select-none transition-colors duration-300"
       :class="app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'"
       style="padding-top: env(safe-area-inset-top); height: calc(32px + env(safe-area-inset-top))"
       @mousedown="startDrag">
    <div class="flex gap-4 text-xs opacity-60 items-center" @mousedown.stop>
      <button @click="app.toggleTheme()" class="hover:text-brand-500 cursor-pointer transition-colors focus:outline-none" title="Toggle theme">
        <Icon :name="app.theme === 'dark' ? 'sun' : 'moon'" />
      </button>
      <button @click="app.openSettings()" class="hover:text-brand-500 cursor-pointer transition-colors focus:outline-none" title="Settings">
        <Icon name="gear" />
      </button>
      <Icon name="bell" class="hover:text-brand-500 cursor-pointer transition-colors" title="Notifications" />
    </div>
  </div>
</template>

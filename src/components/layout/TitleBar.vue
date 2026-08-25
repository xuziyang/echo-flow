<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { platform } from '@tauri-apps/plugin-os'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppStore } from '../../stores/useAppStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const isWindows = platform() === 'windows'
const isMac = platform() === 'macos'
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
  <header class="titlebar" :class="{ macos: isMac }" @mousedown="startDrag">
    <div class="logo">
      <svg class="logo-mark" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="4.2" cy="9" r="2.8" fill="var(--accent)" />
        <path d="M9.5 5.6a4.2 4.2 0 0 1 0 6.8" stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" />
        <path d="M12.6 3.4a7 7 0 0 1 0 11.2" stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" opacity=".45" />
      </svg>
      echoflow
    </div>

    <div class="seg" @mousedown.stop>
      <button :class="{ active: app.mode === 'listening' }" @click="app.switchMode('listening')">听力</button>
      <button :class="{ active: app.mode === 'shadowing' }" @click="app.switchMode('shadowing')">跟读</button>
    </div>

    <div class="spacer"></div>

    <button class="icon-btn" data-tip="切换深色 / 浅色" @mousedown.stop @click="app.toggleTheme()">
      <Icon :name="app.theme === 'dark' ? 'moon' : 'sun'" :size="16" :stroke-width="1.8" />
    </button>
    <button class="icon-btn" data-tip="设置" @mousedown.stop @click="app.openSettings()">
      <Icon name="gear" :size="16" :stroke-width="1.8" />
    </button>

    <div v-if="isWindows" class="win-ctl" @mousedown.stop>
      <button data-tip="最小化" @click="minimize">
        <Icon name="minus" :size="14" :stroke-width="1.8" />
      </button>
      <button :data-tip="isMaximized ? '还原' : '最大化'" @click="toggleMaximize">
        <Icon :name="isMaximized ? 'copy' : 'square'" :size="12" :stroke-width="1.8" />
      </button>
      <button class="close" data-tip="关闭" @click="close">
        <Icon name="xmark" :size="14" :stroke-width="1.8" />
      </button>
    </div>
  </header>
</template>

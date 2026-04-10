// src/stores/useAppStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error'

export const useAppStore = defineStore('app', () => {
  const mode = ref<'listening' | 'shadowing' | 'settings'>('listening')
  const lastMode = ref<'listening' | 'shadowing' | 'settings'>('listening')
  const theme = ref<'dark' | 'light'>('dark')
  const showSidebar = ref(true)
  const currentTitle = ref('Lesson 1: Mastering Daily Greetings')
  const toast = ref('')
  const toastType = ref<ToastType>('success')
  const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
  function switchMode(m: 'listening' | 'shadowing' | 'settings') {
    if (mode.value !== 'settings') lastMode.value = mode.value
    mode.value = m
  }
  function openSettings() { switchMode('settings') }
  function closeSettings() { mode.value = lastMode.value }
  function toggleSidebar() { showSidebar.value = !showSidebar.value }
  function showSubtitleToast(message: string, type: ToastType = 'success') {
    toast.value = message
    toastType.value = type
    if (toastTimer.value) clearTimeout(toastTimer.value)
    toastTimer.value = setTimeout(() => {
      toast.value = ''
      toastType.value = 'success'
    }, 2200)
  }

  return { mode, lastMode, theme, showSidebar, currentTitle, toast, toastType,
           toggleTheme, switchMode, openSettings, closeSettings, toggleSidebar, showSubtitleToast }
})

// src/stores/useAppStore.ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ToastType = 'success' | 'error'
export type AppMode = 'listening' | 'shadowing'
export type AppTheme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'echo-flow:theme'

function loadPersistedTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark'

  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return theme === 'dark' || theme === 'light' ? theme : 'dark'
  } catch (error) {
    console.warn('Failed to load persisted theme:', error)
    return 'dark'
  }
}

function savePersistedTheme(theme: AppTheme) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch (error) {
    console.warn('Failed to persist theme:', error)
  }
}

export const useAppStore = defineStore('app', () => {
  const mode = ref<AppMode>('listening')
  const isSettingsOpen = ref(false)
  const settingsTab = ref('general')
  const theme = ref<AppTheme>(loadPersistedTheme())
  const showSidebar = ref(true)
  const currentTitle = ref('Lesson 1: Mastering Daily Greetings')
  const toast = ref('')
  const toastType = ref<ToastType>('success')
  const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  watch(theme, savePersistedTheme)

  function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
  function switchMode(m: AppMode) { mode.value = m }
  function openSettings(tab?: string) {
    if (tab) settingsTab.value = tab
    isSettingsOpen.value = true
  }
  function closeSettings() { isSettingsOpen.value = false }
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

  return { mode, isSettingsOpen, settingsTab, theme, showSidebar, currentTitle, toast, toastType,
           toggleTheme, switchMode, openSettings, closeSettings, toggleSidebar, showSubtitleToast }
})

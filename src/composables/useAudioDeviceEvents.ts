// src/composables/useAudioDeviceEvents.ts
//
// 监听后端 `audio-devices-changed` 事件（设备热插拔），刷新 store 中的设备列表
// 并校验当前选择。应用启动时（App.vue 挂载）先拉取一次，后续靠事件保持新鲜。
import { onBeforeUnmount, onMounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { useSettingsStore } from '../stores/useSettingsStore'

type UnlistenFn = () => void
type ListenFn = typeof listen

export function createAudioDeviceEventBindings(
  settings = useSettingsStore(),
  listenFn: ListenFn = listen,
) {
  let listenersInitialized = false
  let listenersInitPromise: Promise<void> | null = null
  let removeListeners: UnlistenFn[] = []

  async function initListeners() {
    if (listenersInitialized) return
    if (listenersInitPromise) return listenersInitPromise

    listenersInitPromise = (async () => {
      const onChanged = await listenFn('audio-devices-changed', () => {
        void settings.refreshAudioInputDevices()
        void settings.refreshAudioOutputDevices()
      })
      removeListeners = [onChanged]
      listenersInitialized = true
      listenersInitPromise = null
    })()

    return listenersInitPromise
  }

  function disposeListeners() {
    removeListeners.forEach((unlisten) => unlisten())
    removeListeners = []
    listenersInitialized = false
    listenersInitPromise = null
  }

  return { initListeners, disposeListeners }
}

let defaultBindings: ReturnType<typeof createAudioDeviceEventBindings> | null = null

function getDefaultBindings() {
  if (!defaultBindings) {
    defaultBindings = createAudioDeviceEventBindings()
  }
  return defaultBindings
}

export function useAudioDeviceEvents() {
  const settings = useSettingsStore()

  onMounted(() => {
    // 启动时拉取一次设备列表，避免在第一次热插拔事件前下拉框为空
    void settings.refreshAudioInputDevices()
    void settings.refreshAudioOutputDevices()
    void getDefaultBindings().initListeners()
  })

  onBeforeUnmount(() => {
    getDefaultBindings().disposeListeners()
  })
}

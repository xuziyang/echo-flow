// src/composables/useAudioStreamEvents.ts
//
// 监听活动流的设备丢失事件：
// - `recording-device-lost`：录音流异常终止（如麦克风拔出），保留已采集数据并提示。
// - `playback-device-lost`：播放流异常终止（如扬声器拔出），暂停并提示。
import { onBeforeUnmount, onMounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { useRecordingStore } from '../stores/useRecordingStore'
import { usePlayerStore } from '../stores/usePlayerStore'

type UnlistenFn = () => void
type ListenFn = typeof listen

export function createAudioStreamEventBindings(
  recording = useRecordingStore(),
  player = usePlayerStore(),
  listenFn: ListenFn = listen,
) {
  let listenersInitialized = false
  let listenersInitPromise: Promise<void> | null = null
  let removeListeners: UnlistenFn[] = []

  async function initListeners() {
    if (listenersInitialized) return
    if (listenersInitPromise) return listenersInitPromise

    listenersInitPromise = (async () => {
      const onRecordingLost = await listenFn('recording-device-lost', () => {
        void recording.handleRecordingDeviceLost()
      })

      const onPlaybackLost = await listenFn('playback-device-lost', () => {
        void player.pauseForDeviceLost()
      })

      removeListeners = [onRecordingLost, onPlaybackLost]
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

let defaultBindings: ReturnType<typeof createAudioStreamEventBindings> | null = null

function getDefaultBindings() {
  if (!defaultBindings) {
    defaultBindings = createAudioStreamEventBindings()
  }
  return defaultBindings
}

export function useAudioStreamEvents() {
  onMounted(() => {
    void getDefaultBindings().initListeners()
  })

  onBeforeUnmount(() => {
    getDefaultBindings().disposeListeners()
  })
}

import { onBeforeUnmount, onMounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '../stores/useAppStore'
import { usePlayerStore } from '../stores/usePlayerStore'

type UnlistenFn = () => void
type ListenFn = typeof listen

export interface WaveformPreviewEvent {
  path: string
  waveform_samples: number[]
}

export interface WaveformPreviewErrorEvent {
  path: string
  error: string
}

export function createWaveformPreviewEventBindings(
  player = usePlayerStore(),
  app = useAppStore(),
  listenFn: ListenFn = listen,
) {
  let listenersInitialized = false
  let listenersInitPromise: Promise<void> | null = null
  let removeListeners: UnlistenFn[] = []

  async function initListeners() {
    if (listenersInitialized) return
    if (listenersInitPromise) return listenersInitPromise

    listenersInitPromise = (async () => {
      const onReady = await listenFn<WaveformPreviewEvent>('waveform-preview-ready', (event) => {
        player.applyWaveformPreview(event.payload.path, event.payload.waveform_samples)
      })

      const onError = await listenFn<WaveformPreviewErrorEvent>('waveform-preview-error', (event) => {
        if (event.payload.path !== player.currentPath) return
        app.showSubtitleToast(event.payload.error, 'error')
      })

      removeListeners = [onReady, onError]
      listenersInitialized = true
      listenersInitPromise = null
    })()

    return listenersInitPromise
  }

  function disposeListeners() {
    removeListeners.forEach(unlisten => unlisten())
    removeListeners = []
    listenersInitialized = false
    listenersInitPromise = null
  }

  return {
    initListeners,
    disposeListeners,
  }
}

let defaultBindings: ReturnType<typeof createWaveformPreviewEventBindings> | null = null

function getDefaultBindings() {
  if (!defaultBindings) {
    defaultBindings = createWaveformPreviewEventBindings()
  }
  return defaultBindings
}

export function useWaveformPreviewEvents() {
  onMounted(() => {
    void getDefaultBindings().initListeners()
  })

  onBeforeUnmount(() => {
    getDefaultBindings().disposeListeners()
  })
}

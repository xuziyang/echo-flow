import { onBeforeUnmount, onMounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import {
  useTranscriptStore,
  type TranscribeDoneEvent,
  type TranscribeErrorEvent,
  type TranscribeProgressEvent,
} from '../stores/useTranscriptStore'

type UnlistenFn = () => void
type ListenFn = typeof listen

export function createTranscribeEventBindings(
  transcript = useTranscriptStore(),
  listenFn: ListenFn = listen,
) {
  let listenersInitialized = false
  let listenersInitPromise: Promise<void> | null = null
  let removeTranscribeListeners: UnlistenFn[] = []

  async function initTranscribeListeners() {
    if (listenersInitialized) return
    if (listenersInitPromise) return listenersInitPromise

    listenersInitPromise = (async () => {
      const onProgress = await listenFn<TranscribeProgressEvent>('transcribe-progress', (event) => {
        transcript.applyTranscribeProgress(event.payload)
      })

      const onDone = await listenFn<TranscribeDoneEvent>('transcribe-done', (event) => {
        transcript.applyTranscribeDone(event.payload)
      })

      const onError = await listenFn<TranscribeErrorEvent>('transcribe-error', (event) => {
        transcript.applyTranscribeError(event.payload)
      })

      removeTranscribeListeners = [onProgress, onDone, onError]
      listenersInitialized = true
      listenersInitPromise = null
    })()

    return listenersInitPromise
  }

  function disposeTranscribeListeners() {
    removeTranscribeListeners.forEach(unlisten => unlisten())
    removeTranscribeListeners = []
    listenersInitialized = false
    listenersInitPromise = null
  }

  return {
    initTranscribeListeners,
    disposeTranscribeListeners,
  }
}

let defaultBindings: ReturnType<typeof createTranscribeEventBindings> | null = null

function getDefaultBindings() {
  if (!defaultBindings) {
    defaultBindings = createTranscribeEventBindings()
  }
  return defaultBindings
}

export function useTranscribeEvents() {
  onMounted(() => {
    void getDefaultBindings().initTranscribeListeners()
  })

  onBeforeUnmount(() => {
    getDefaultBindings().disposeTranscribeListeners()
  })
}

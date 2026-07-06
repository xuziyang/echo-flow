import { onBeforeUnmount, onMounted } from 'vue'
import { listen } from '@tauri-apps/api/event'
import {
  useTranscriptStore,
  type RegenerateTextsDoneEvent,
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
        console.info('[transcribe-done] event received', {
          jobId: event.payload.job_id,
          audioPath: event.payload.audio_path,
          segments: event.payload.segments.length,
          firstSegment: event.payload.segments[0]?.en ?? null,
        })
        transcript.applyTranscribeDone(event.payload)
      })

      const onTextsDone = await listenFn<RegenerateTextsDoneEvent>('transcribe-texts-done', (event) => {
        console.info('[transcribe-texts-done] event received', {
          jobId: event.payload.job_id,
          audioPath: event.payload.audio_path,
          updates: event.payload.updates.length,
        })
        transcript.applyRegenerateTextsDone(event.payload)
      })

      const onError = await listenFn<TranscribeErrorEvent>('transcribe-error', (event) => {
        transcript.applyTranscribeError(event.payload)
      })

      removeTranscribeListeners = [onProgress, onDone, onTextsDone, onError]
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

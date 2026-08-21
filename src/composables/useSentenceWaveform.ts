import { computed } from 'vue'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useTranscriptStore, type Sentence } from '../stores/useTranscriptStore'

interface TimedRange {
  startMs: number
  endMs: number
}

function getTimedRange(sentence: Sentence | undefined): TimedRange | null {
  if (
    !sentence
    || !Number.isFinite(sentence.start_ms)
    || !Number.isFinite(sentence.end_ms)
    || (sentence.end_ms as number) <= (sentence.start_ms as number)
  ) {
    return null
  }
  return { startMs: sentence.start_ms as number, endMs: sentence.end_ms as number }
}

/** 当前句波形切片与播放进度（听力视图 / 跟读原音波形共用） */
export function useSentenceWaveform() {
  const player = usePlayerStore()
  const transcript = useTranscriptStore()

  const currentSentence = computed(() => transcript.sentences[player.currentIndex])
  const currentRange = computed(() => getTimedRange(currentSentence.value))

  /* 当前句波形切片（从整段音频波形采样中截取） */
  const sentenceSamples = computed(() => {
    const range = currentRange.value
    const samples = player.waveformSamples
    if (!range || samples.length === 0 || player.durationMs <= 0) return []

    const startRatio = Math.max(0, Math.min(1, range.startMs / player.durationMs))
    const endRatio = Math.max(startRatio, Math.min(1, range.endMs / player.durationMs))
    const startIndex = Math.floor(startRatio * samples.length)
    const endIndex = Math.max(startIndex + 1, Math.ceil(endRatio * samples.length))

    return samples.slice(startIndex, endIndex)
  })

  const sentenceDurationMs = computed(() => {
    const range = currentRange.value
    return range ? range.endMs - range.startMs : 0
  })

  const sentenceProgress = computed(() => {
    const range = currentRange.value
    if (!range) return 0
    return Math.max(0, Math.min(1, (player.positionMs - range.startMs) / (range.endMs - range.startMs)))
  })

  return { currentSentence, sentenceSamples, sentenceDurationMs, sentenceProgress }
}

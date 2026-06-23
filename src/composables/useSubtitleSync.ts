import type { Sentence } from '../stores/useTranscriptStore'

const SUBTITLE_SYNC_LEAD_MS = 120

// Binary search for O(log n) lookup instead of O(n) linear scan
export function getCurrentSubtitleIndex(positionMs: number, sentences: Sentence[]): number {
  let low = 0
  let high = sentences.length - 1
  let result = 0

  while (low <= high) {
    const mid = (low + high) >>> 1
    const sentence = sentences[mid]
    const start = sentence.start_ms ?? 0

    if (positionMs + SUBTITLE_SYNC_LEAD_MS >= start) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

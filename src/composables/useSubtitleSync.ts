import type { Sentence } from '../stores/useTranscriptStore'

// Binary search for O(log n) lookup instead of O(n) linear scan
export function getCurrentSubtitleIndex(positionMs: number, sentences: Sentence[]): number {
  let low = 0
  let high = sentences.length - 1
  let result = 0

  while (low <= high) {
    const mid = (low + high) >>> 1
    const sentence = sentences[mid]
    const start = sentence.start_ms ?? 0
    const lead = 120

    if (Math.max(0, positionMs + lead) >= start) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

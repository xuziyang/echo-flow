import type { Sentence } from '../stores/useTranscriptStore'

export const MIN_SUBTITLE_SYNC_LEAD_MS = 80
export const MAX_SUBTITLE_SYNC_LEAD_MS = 220

export function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value))
}

export function getAdaptiveLeadMs(startMs?: number, endMs?: number): number {
  const diff = (endMs ?? startMs ?? 0) - (startMs ?? 0)
  const duration = diff > 0 ? diff : 1000
  // Lead time is 35% of sentence duration, clamped to min/max bounds
  return clamp(Math.round(duration * 0.35), MIN_SUBTITLE_SYNC_LEAD_MS, MAX_SUBTITLE_SYNC_LEAD_MS)
}

// Binary search for O(log n) lookup instead of O(n) linear scan
export function getCurrentSubtitleIndex(positionMs: number, sentences: Sentence[]): number {
  let low = 0
  let high = sentences.length - 1
  let result = 0

  while (low <= high) {
    const mid = (low + high) >>> 1
    const sentence = sentences[mid]
    const start = sentence.start_ms ?? 0
    const lead = getAdaptiveLeadMs(sentence.start_ms, sentence.end_ms)

    if (Math.max(0, positionMs + lead) >= start) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

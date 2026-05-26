export interface WaveformBar {
  index: number
  height: number
}

export function getWaveformBarCount(durationMs?: number, sentenceText = '', availableWidthPx?: number): number {
  if ((!durationMs || durationMs <= 0) && sentenceText.trim().length === 0) return 150

  const barsPerSecond = 26
  const durationCount = durationMs && durationMs > 0
    ? (durationMs / 1000) * barsPerSecond
    : 0
  const textCount = estimateTextBarCount(sentenceText)
  const count = durationCount > 0 && textCount > 0
    ? Math.round(durationCount * 0.7 + textCount * 0.3)
    : Math.round(durationCount || textCount)

  const maxByContent = Math.max(36, Math.min(190, count))
  if (!availableWidthPx || availableWidthPx <= 0) return maxByContent

  const maxWaveformWidthPx = Math.min(availableWidthPx, 768)
  const maxByWidth = Math.floor((maxWaveformWidthPx + 4) / 5)

  return Math.max(24, Math.min(maxByContent, maxByWidth))
}

export function getWaveformPixelWidth(barCount: number): number {
  const barWidthPx = 1
  const gapPx = 4
  return Math.max(0, barCount * barWidthPx + Math.max(0, barCount - 1) * gapPx)
}

export function buildWaveformBars(samples: number[], barCount = 150, smoothingRadius = 1): WaveformBar[] {
  if (samples.length === 0 || barCount <= 0) return []

  const step = samples.length / barCount
  const peaks: number[] = []

  for (let i = 0; i < barCount; i++) {
    const start = Math.floor(i * step)
    const end = Math.max(start + 1, Math.min(samples.length, Math.ceil((i + 1) * step)))
    let peak = 0

    for (let j = start; j < end; j++) {
      peak = Math.max(peak, Math.abs(samples[j] ?? 0))
    }

    peaks.push(peak)
  }

  const smoothedPeaks = smoothPeaks(peaks, smoothingRadius)
  const maxPeak = Math.max(...smoothedPeaks, 0.001)

  return smoothedPeaks.map((peak, index) => ({
    index,
    height: Math.max(Math.pow(peak / maxPeak, 0.9) * 100, 6),
  }))
}

function estimateTextBarCount(text: string): number {
  const normalized = text.trim()
  if (!normalized) return 0

  const words = normalized.match(/[A-Za-z0-9']+/g)?.length ?? 0
  const cjkChars = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const otherChars = normalized.replace(/[A-Za-z0-9'\s\u3400-\u9fff]/g, '').length

  return words * 5 + cjkChars * 2.5 + otherChars
}

function smoothPeaks(peaks: number[], radius: number): number[] {
  if (radius <= 0 || peaks.length <= 2) return peaks

  return peaks.map((peak, index) => {
    let total = peak * 4
    let weight = 4

    for (let offset = 1; offset <= radius; offset++) {
      const falloff = (radius - offset + 1) * 0.75
      const previous = peaks[index - offset]
      const next = peaks[index + offset]

      if (previous !== undefined) {
        total += previous * falloff
        weight += falloff
      }

      if (next !== undefined) {
        total += next * falloff
        weight += falloff
      }
    }

    return total / weight
  })
}

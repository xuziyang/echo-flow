// src/composables/useWaveform.ts
// Canvas-based waveform renderer
import { onMounted, onUnmounted, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { toValue } from 'vue'

export interface WaveformOptions {
  samples: Ref<number[]>
  isPlaying: Ref<boolean>
  progress: Ref<number> // 0.0 - 1.0
  activeColor: MaybeRefOrGetter<string>
  inactiveColor: MaybeRefOrGetter<string>
  playedColor: MaybeRefOrGetter<string>
  backgroundColor?: MaybeRefOrGetter<string>
  centerLineColor?: MaybeRefOrGetter<string>
}

export function useWaveform(canvasRef: Ref<HTMLCanvasElement | null>, options: WaveformOptions) {
  const {
    samples,
    isPlaying,
    progress,
    activeColor,
    inactiveColor,
    playedColor,
    backgroundColor,
    centerLineColor,
  } = options

  let animFrame: number | null = null
  let resizeObserver: ResizeObserver | null = null

  function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value))
  }

  function applyAlphaToColor(color: string, alpha: number): string {
    const normalizedAlpha = clamp01(alpha)
    const rgbaMatch = color.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i)
    if (rgbaMatch) {
      const [, r, g, b] = rgbaMatch
      return `rgba(${r},${g},${b},${normalizedAlpha})`
    }

    const rgbMatch = color.match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i)
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch
      return `rgba(${r},${g},${b},${normalizedAlpha})`
    }

    return color
  }

  function interpolateSample(data: number[], index: number): number {
    const n = data.length
    if (n === 0) return 0
    const clamped = Math.max(0, Math.min(n - 1, index))
    const left = Math.floor(clamped)
    const right = Math.min(n - 1, left + 1)
    const t = clamped - left
    const leftValue = data[left] ?? 0
    const rightValue = data[right] ?? leftValue
    return leftValue + (rightValue - leftValue) * t
  }

  function stopDrawing() {
    if (animFrame !== null) {
      cancelAnimationFrame(animFrame)
      animFrame = null
    }
  }

  function disconnectResizeObserver() {
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  function getCanvasMetrics(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    return { width, height }
  }

  function draw() {
    const canvas = canvasRef.value
    if (!canvas) {
      animFrame = null
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      animFrame = null
      return
    }

    const { width: W, height: H } = getCanvasMetrics(canvas, ctx)

    const data = samples.value
    const n = data.length

    if (backgroundColor) {
      ctx.fillStyle = toValue(backgroundColor)
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.clearRect(0, 0, W, H)
    }

    const centerY = H / 2
    const fullProgressPos = Math.max(0, Math.min(1, progress.value)) * n
    const visibleCount = Math.max(1, n)
    const samplesPerPixel = visibleCount / Math.max(1, W)
    const detailFactor = clamp01(1 - Math.min(1, samplesPerPixel))

    if (n === 0) {
      if (centerLineColor) {
        ctx.strokeStyle = toValue(centerLineColor)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, centerY + 0.5)
        ctx.lineTo(W, centerY + 0.5)
        ctx.stroke()
      }
      return
    }

    const maxStart = Math.max(0, n - visibleCount)
    const startIndex = Math.round(Math.min(maxStart, Math.max(0, fullProgressPos - visibleCount / 2)))
    const maxAmpPx = H * 0.47
    const columns = Math.max(2, Math.floor(W))
    const topY: number[] = new Array(columns)
    const bottomY: number[] = new Array(columns)
    const isDetailMode = samplesPerPixel <= 1

    for (let x = 0; x < columns; x++) {
      if (isDetailMode) {
        const t = columns <= 1 ? 0 : x / (columns - 1)
        const samplePos = startIndex + t * Math.max(0, visibleCount - 1)
        const sampleValue = interpolateSample(data, samplePos)
        const ampPx = Math.min(1, Math.abs(sampleValue)) * maxAmpPx
        topY[x] = centerY - ampPx
        bottomY[x] = centerY + ampPx
        continue
      }

      const left = startIndex + Math.floor((x / columns) * visibleCount)
      const right = Math.max(left + 1, startIndex + Math.floor(((x + 1) / columns) * visibleCount))
      let minValue = 1
      let maxValue = -1
      for (let i = left; i < right && i < n; i++) {
        const value = data[i] ?? 0
        if (value < minValue) minValue = value
        if (value > maxValue) maxValue = value
      }

      if (minValue > maxValue) {
        const fallback = data[left] ?? 0
        minValue = fallback
        maxValue = fallback
      }

      topY[x] = centerY - Math.min(1, Math.abs(maxValue)) * maxAmpPx
      bottomY[x] = centerY + Math.min(1, Math.abs(minValue)) * maxAmpPx
    }

    const waveformPath = new Path2D()
    waveformPath.moveTo(0, topY[0]!)
    for (let x = 1; x < columns; x++) {
      waveformPath.lineTo(x, topY[x]!)
    }
    for (let x = columns - 1; x >= 0; x--) {
      waveformPath.lineTo(x, bottomY[x]!)
    }
    waveformPath.closePath()

    const baseColor = isPlaying.value ? toValue(activeColor) : toValue(inactiveColor)
    const playedBaseColor = toValue(playedColor)
    const detailFillAlpha = 0.26 - detailFactor * 0.18
    const inactiveFillColor = isDetailMode ? applyAlphaToColor(baseColor, detailFillAlpha) : baseColor
    const playedFillColor = isDetailMode ? applyAlphaToColor(playedBaseColor, detailFillAlpha + 0.06) : playedBaseColor

    ctx.fillStyle = inactiveFillColor
    ctx.fill(waveformPath)

    if (isDetailMode) {
      ctx.lineWidth = 1
      ctx.strokeStyle = baseColor

      ctx.beginPath()
      ctx.moveTo(0, topY[0]!)
      for (let x = 1; x < columns; x++) {
        ctx.lineTo(x, topY[x]!)
      }
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(0, bottomY[0]!)
      for (let x = 1; x < columns; x++) {
        ctx.lineTo(x, bottomY[x]!)
      }
      ctx.stroke()
    }

    const playedX = Math.max(0, Math.min(W, ((fullProgressPos - startIndex) / visibleCount) * W))
    if (playedX > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, playedX, H)
      ctx.clip()
      ctx.fillStyle = playedFillColor
      ctx.fill(waveformPath)

      if (isDetailMode) {
        ctx.lineWidth = 1
        ctx.strokeStyle = playedBaseColor

        ctx.beginPath()
        ctx.moveTo(0, topY[0]!)
        for (let x = 1; x < columns; x++) {
          ctx.lineTo(x, topY[x]!)
        }
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(0, bottomY[0]!)
        for (let x = 1; x < columns; x++) {
          ctx.lineTo(x, bottomY[x]!)
        }
        ctx.stroke()
      }

      ctx.restore()
    }

    if (centerLineColor) {
      ctx.strokeStyle = toValue(centerLineColor)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, centerY + 0.5)
      ctx.lineTo(W, centerY + 0.5)
      ctx.stroke()
    }

    animFrame = requestAnimationFrame(draw)
  }

  function startDrawing() {
    stopDrawing()
    draw()
  }

  onMounted(() => {
    watch(
      canvasRef,
      (canvas) => {
        disconnectResizeObserver()
        stopDrawing()

        if (!canvas) {
          return
        }

        resizeObserver = new ResizeObserver(() => {
          startDrawing()
        })
        resizeObserver.observe(canvas)
        startDrawing()
      },
      { immediate: true },
    )

    watch([samples, isPlaying, progress], () => {
      if (canvasRef.value) {
        startDrawing()
      }
    })
  })

  onUnmounted(() => {
    stopDrawing()
    disconnectResizeObserver()
  })

  return { draw }
}

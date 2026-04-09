// src/composables/useWaveform.ts
// Canvas-based waveform renderer
import { onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'

export interface WaveformOptions {
  samples: Ref<number[]>
  isPlaying: Ref<boolean>
  progress: Ref<number> // 0.0 - 1.0
  activeColor: string
  inactiveColor: string
  playedColor: string
}

export function useWaveform(canvasRef: Ref<HTMLCanvasElement | null>, options: WaveformOptions) {
  const { samples, isPlaying, progress, activeColor, inactiveColor, playedColor } = options

  let animFrame: number | null = null

  function draw() {
    const canvas = canvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const W = rect.width
    const H = rect.height

    // Scale canvas for HiDPI
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)
    }

    const data = samples.value
    const n = data.length

    ctx.clearRect(0, 0, W, H)

    if (n === 0) {
      // debug: show red border if no data
      ctx.strokeStyle = 'red'
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, W, H)
      return
    }

    const barW = Math.max(1, W / n)
    const barGap = Math.max(0, barW < 3 ? 0 : 1)
    const drawnBarW = barW - barGap
    const centerY = H / 2

    for (let i = 0; i < n; i++) {
      const x = i * barW
      const amplitude = Math.abs(data[i]) // data is already 0-1 range
      const barH = Math.max(2, amplitude * H * 0.9)

      const progressPos = progress.value * n
      if (i < progressPos) {
        ctx.fillStyle = playedColor
      } else {
        ctx.fillStyle = isPlaying.value ? activeColor : inactiveColor
      }

      ctx.fillRect(x, centerY - barH / 2, drawnBarW, barH)
    }

    animFrame = requestAnimationFrame(draw)
  }

  onMounted(() => {
    draw()
  })

  onUnmounted(() => {
    if (animFrame !== null) {
      cancelAnimationFrame(animFrame)
    }
  })

  return { draw }
}

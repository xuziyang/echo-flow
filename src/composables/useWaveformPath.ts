const WAVEFORM_WIDTH = 1000
const WAVEFORM_HEIGHT = 96

export interface WaveformPathOptions {
  pointCount?: number
  width?: number
  height?: number
  minAmplitude?: number
}

export interface WaveformLinePaths {
  top: string
  bottom: string
}

export interface WaveformPeakPathResult {
  area: string
  top: string
  bottom: string
}

export function buildWaveformAreaPath(samples: number[], options: WaveformPathOptions = {}): string {
  const paths = buildWaveformLinePaths(samples, options)
  if (!paths.top || !paths.bottom) return ''

  return [
    paths.top,
    'L',
    paths.bottom.replace(/^M\s*/, ''),
    'Z',
  ].join(' ')
}

export function buildWaveformPeakPaths(samples: number[], options: WaveformPathOptions = {}): WaveformPeakPathResult {
  const paths = buildWaveformLinePaths(samples, options)
  if (!paths.top || !paths.bottom) {
    return { area: '', top: '', bottom: '' }
  }

  return {
    area: [
      paths.top,
      'L',
      paths.bottom.replace(/^M\s*/, ''),
      'Z',
    ].join(' '),
    top: paths.top,
    bottom: paths.bottom,
  }
}

export function buildWaveformLinePaths(samples: number[], options: WaveformPathOptions = {}): WaveformLinePaths {
  const width = options.width ?? WAVEFORM_WIDTH
  const height = options.height ?? WAVEFORM_HEIGHT
  const pointCount = options.pointCount ?? 520
  const minAmplitude = options.minAmplitude ?? 0

  if (samples.length === 0 || pointCount <= 1) {
    return { top: '', bottom: '' }
  }

  const amplitudes = extractAmplitudes(samples, pointCount)
  const maxAmplitude = Math.max(...amplitudes, 0.001)
  const centerY = height / 2
  const maxAmplitudePx = height * 0.46
  const topPoints = amplitudes.map((amplitude, index) => {
    const x = (index / Math.max(1, amplitudes.length - 1)) * width
    const y = centerY - Math.max((amplitude / maxAmplitude) * maxAmplitudePx, minAmplitude)
    return [x, y] as const
  })
  const bottomPoints = amplitudes.map((amplitude, index) => {
    const x = (index / Math.max(1, amplitudes.length - 1)) * width
    const y = centerY + Math.max((amplitude / maxAmplitude) * maxAmplitudePx, minAmplitude)
    return [x, y] as const
  })

  return {
    top: linearPath(topPoints),
    bottom: linearPath(bottomPoints),
  }
}

export function buildWaveformCenterPath(samples: number[], options: WaveformPathOptions = {}): string {
  const width = options.width ?? WAVEFORM_WIDTH
  const height = options.height ?? WAVEFORM_HEIGHT
  const pointCount = options.pointCount ?? 720

  if (samples.length === 0 || pointCount <= 1) return ''

  const values = smoothValues(extractSignedSamples(samples, pointCount), 2)
  const maxValue = Math.max(...values.map(value => Math.abs(value)), 0.001)
  const centerY = height / 2
  const maxAmplitudePx = height * 0.38
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width
    const y = centerY - (value / maxValue) * maxAmplitudePx
    return [x, y] as const
  })

  return smoothPath(points)
}

function extractAmplitudes(samples: number[], pointCount: number): number[] {
  if (samples.length <= pointCount) {
    return samples.map(sample => Math.abs(sample))
  }

  const step = samples.length / pointCount
  const amplitudes: number[] = []

  for (let i = 0; i < pointCount; i++) {
    const start = Math.floor(i * step)
    const end = Math.max(start + 1, Math.min(samples.length, Math.ceil((i + 1) * step)))
    let peak = 0
    for (let j = start; j < end; j++) {
      peak = Math.max(peak, Math.abs(samples[j] ?? 0))
    }
    amplitudes.push(peak)
  }

  return amplitudes
}

function extractSignedSamples(samples: number[], pointCount: number): number[] {
  if (samples.length <= pointCount) return samples

  const step = samples.length / pointCount
  const values: number[] = []

  for (let i = 0; i < pointCount; i++) {
    const start = Math.floor(i * step)
    const end = Math.max(start + 1, Math.min(samples.length, Math.ceil((i + 1) * step)))
    let selected = samples[start] ?? 0

    for (let j = start; j < end; j++) {
      const value = samples[j] ?? 0
      if (Math.abs(value) > Math.abs(selected)) {
        selected = value
      }
    }

    values.push(selected)
  }

  return values
}

function smoothValues(values: number[], radius: number): number[] {
  if (radius <= 0 || values.length <= 2) return values

  return values.map((_, index) => {
    const start = Math.max(0, index - radius)
    const end = Math.min(values.length - 1, index + radius)
    let total = 0
    let count = 0

    for (let i = start; i <= end; i++) {
      total += values[i] ?? 0
      count += 1
    }

    return total / count
  })
}

function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`

  const [firstX, firstY] = points[0]!
  const commands = [`M ${firstX.toFixed(2)} ${firstY.toFixed(2)}`]

  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!
    const [previousX, previousY] = points[i - 1]!
    const controlX = (previousX + x) / 2
    const controlY = (previousY + y) / 2
    commands.push(`Q ${previousX.toFixed(2)} ${previousY.toFixed(2)} ${controlX.toFixed(2)} ${controlY.toFixed(2)}`)
  }

  const [lastX, lastY] = points[points.length - 1]!
  commands.push(`L ${lastX.toFixed(2)} ${lastY.toFixed(2)}`)

  return commands.join(' ')
}

function linearPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return ''

  const [firstX, firstY] = points[0]!
  const commands = [`M ${firstX.toFixed(2)} ${firstY.toFixed(2)}`]

  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!
    commands.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`)
  }

  return commands.join(' ')
}

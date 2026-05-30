// src/stores/useRecordingStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'
import { usePlayerStore } from './usePlayerStore'
import { useTranscriptStore } from './useTranscriptStore'

interface RecordingResult {
  samples: number[]
  sample_rate: number
  channels: number
}

export const useRecordingStore = defineStore('recording', () => {
  const app = useAppStore()
  const player = usePlayerStore()
  const transcript = useTranscriptStore()
  const isRecording = ref(false)
  const userAudioUrl = ref<string | null>(null)
  const userWaveformSamples = ref<number[]>([])
  const recordingSamples = ref<number[]>([])
  const activePlaybackMode = ref<'recording' | 'comparison' | null>(null)
  const recordingSampleRate = ref(44100)
  const recordingChannels = ref(1)
  const recordingDurationMs = ref(0)

  let htmlAudio: HTMLAudioElement | null = null
  let playbackToken = 0
  let waveformTimer: ReturnType<typeof setInterval> | null = null
  let audioContext: AudioContext | null = null
  let audioBufferSource: AudioBufferSourceNode | null = null

  function clearActiveAudio() {
    if (audioBufferSource) {
      audioBufferSource.stop()
      audioBufferSource = null
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
      audioContext = null
    }
    if (htmlAudio) {
      htmlAudio.pause()
      htmlAudio = null
    }
  }

  function stopPlayback() {
    playbackToken += 1
    clearActiveAudio()
    activePlaybackMode.value = null
  }

  function revokeUserAudioUrl() {
    if (!userAudioUrl.value) return
    stopPlayback()
    URL.revokeObjectURL(userAudioUrl.value)
    userAudioUrl.value = null
  }

  async function toggleRecording() {
    if (isRecording.value) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }

  async function startRecording() {
    if (activePlaybackMode.value || player.isPlaying || player.seeking) return

    try {
      stopPlayback()
      await player.clearSentenceSegment({ pausePlayback: true })
      await invoke('start_recording')
      userWaveformSamples.value = []
      startWaveformPolling()
      isRecording.value = true
    } catch (err) {
      stopWaveformPolling()
      app.showSubtitleToast(typeof err === 'string' ? err : String(err), 'error')
    }
  }

  async function stopRecording() {
    if (!isRecording.value) return

    try {
      stopWaveformPolling()
      const result = (await invoke('stop_recording')) as RecordingResult
      recordingSamples.value = result.samples
      recordingSampleRate.value = result.sample_rate
      recordingChannels.value = result.channels || 1
      recordingDurationMs.value = result.sample_rate > 0
        ? Math.round((result.samples.length / result.sample_rate / recordingChannels.value) * 1000)
        : 0

      // Convert samples to audio URL for playback
      if (recordingSamples.value.length > 0) {
        const audioData = createWavFromSamples(
          recordingSamples.value,
          recordingSampleRate.value,
          recordingChannels.value,
        )
        revokeUserAudioUrl()
        const blob = new Blob([audioData], { type: 'audio/wav' })
        userAudioUrl.value = URL.createObjectURL(blob)

        // Get waveform from samples
        userWaveformSamples.value = extractWaveformFromSamples(recordingSamples.value, 640)
      }
    } catch (err) {
      app.showSubtitleToast(typeof err === 'string' ? err : String(err), 'error')
    } finally {
      stopWaveformPolling()
      isRecording.value = false
    }
  }

  function stopWaveformPolling() {
    if (waveformTimer === null) return
    clearInterval(waveformTimer)
    waveformTimer = null
  }

  function startWaveformPolling() {
    stopWaveformPolling()

    const updateWaveform = async () => {
      try {
        const waveform = await invoke<number[]>('get_recording_waveform', { numSamples: 640 })
        userWaveformSamples.value = waveform
      } catch {
        stopWaveformPolling()
      }
    }

    void updateWaveform()
    waveformTimer = setInterval(() => {
      void updateWaveform()
    }, 120)
  }

  /**
   * Convert float samples to WAV format
   */
  function createWavFromSamples(samples: number[], sampleRate = 44100, numChannels = 1): ArrayBuffer {
    const bitsPerSample = 16
    const bytesPerSample = bitsPerSample / 8
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = samples.length * blockAlign
    const bufferSize = 44 + dataSize

    const buffer = new ArrayBuffer(bufferSize)
    const view = new DataView(buffer)

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, bufferSize - 8, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // fmt chunk size
    view.setUint16(20, 1, true) // audio format (PCM)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)

    // Write audio data
    let offset = 44
    for (const sample of samples) {
      const clamped = Math.max(-1, Math.min(1, sample))
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      view.setInt16(offset, int16, true)
      offset += 2
    }

    return buffer
  }

  /**
   * Extract waveform from audio samples
   */
  function extractWaveformFromSamples(samples: number[], numSamples: number): number[] {
    if (samples.length === 0) return []

    const step = Math.max(1, Math.floor(samples.length / numSamples))
    const waveform: number[] = []
    let globalMax = 0.001

    for (let i = 0; i < numSamples; i++) {
      const start = i * step
      const end = Math.min(start + step, samples.length)

      if (start >= samples.length) break

      let maxVal = 0
      for (let j = start; j < end; j++) {
        maxVal = Math.max(maxVal, Math.abs(samples[j]))
      }
      globalMax = Math.max(globalMax, maxVal)
      waveform.push(maxVal)
    }

    return waveform.map(s => s / globalMax)
  }

  function createPlaybackEndHandler(currentToken: number) {
    return () => {
      if (currentToken !== playbackToken) return
      clearActiveAudio()
      activePlaybackMode.value = null
    }
  }

  async function playUserRecording(mode: 'recording' | 'comparison' = 'recording') {
    if (!userAudioUrl.value && recordingSamples.value.length === 0) return
    if (isRecording.value || player.isPlaying || player.seeking) return

    stopPlayback()
    await player.clearSentenceSegment({ pausePlayback: true })
    playbackToken += 1
    const currentToken = playbackToken
    activePlaybackMode.value = mode

    try {
      if (recordingSamples.value.length > 0) {
        audioContext = new AudioContext()
        const audioBuffer = audioContext.createBuffer(
          1,
          recordingSamples.value.length,
          recordingSampleRate.value
        )
        const channelData = new Float32Array(recordingSamples.value)
        audioBuffer.copyToChannel(channelData, 0)

        audioBufferSource = audioContext.createBufferSource()
        audioBufferSource.buffer = audioBuffer
        audioBufferSource.connect(audioContext.destination)
        audioBufferSource.onended = createPlaybackEndHandler(currentToken)
        audioBufferSource.start()
      } else {
        const audio = new Audio(userAudioUrl.value!)
        htmlAudio = audio
        audio.onended = createPlaybackEndHandler(currentToken)
        audio.onerror = () => {
          createPlaybackEndHandler(currentToken)()
          app.showSubtitleToast('录音播放失败', 'error')
        }
        await audio.play()
      }
    } catch (error) {
      clearActiveAudio()
      activePlaybackMode.value = null
      app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
    }
  }

  async function playComparison() {
    if (recordingSamples.value.length === 0 && !userAudioUrl.value) return
    if (isRecording.value || activePlaybackMode.value || player.isPlaying || player.seeking) return

    const sentence = transcript.sentences[player.currentIndex]
    const startedOriginal = await player.playSentenceSegment(sentence?.start_ms, sentence?.end_ms)
    if (!startedOriginal) {
      app.showSubtitleToast('当前句缺少时间戳，无法播放原音对比', 'error')
      return
    }

    await playUserRecording('comparison')
  }

  async function saveRecording(path: string) {
    if (recordingSamples.value.length === 0) return
    try {
      await invoke('save_recording', {
        path,
        samples: recordingSamples.value,
        sampleRate: recordingSampleRate.value,
        channels: recordingChannels.value,
      })
    } catch (error) {
      app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
    }
  }

  return {
    isRecording,
    userAudioUrl,
    userWaveformSamples,
    recordingDurationMs,
    activePlaybackMode,
    toggleRecording,
    playUserRecording,
    playComparison,
    saveRecording,
    stopPlayback,
  }
})

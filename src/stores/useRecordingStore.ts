// src/stores/useRecordingStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'
import { usePlayerStore } from './usePlayerStore'
import { useTranscriptStore } from './useTranscriptStore'

export const useRecordingStore = defineStore('recording', () => {
  const app = useAppStore()
  const player = usePlayerStore()
  const transcript = useTranscriptStore()
  const isRecording = ref(false)
  const userAudioUrl = ref<string | null>(null)
  const userWaveformSamples = ref<number[]>([])
  const recordingBlob = ref<Blob | null>(null)
  const activePlaybackMode = ref<'recording' | 'comparison' | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let recordingStream: MediaStream | null = null
  let audioChunks: Blob[] = []
  let activeAudio: HTMLAudioElement | null = null
  let playbackToken = 0

  function clearActiveAudio() {
    if (!activeAudio) return
    activeAudio.pause()
    activeAudio.currentTime = 0
    activeAudio.onended = null
    activeAudio.onerror = null
    activeAudio = null
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

  function stopRecordingStream() {
    if (!recordingStream) return
    recordingStream.getTracks().forEach(track => track.stop())
    recordingStream = null
  }

  async function toggleRecording() {
    if (isRecording.value) {
      stopRecording()
    } else {
      await startRecording()
    }
  }

  async function startRecording() {
    try {
      stopPlayback()
      await player.clearSentenceSegment({ pausePlayback: true })
      stopRecordingStream()
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(recordingStream, { mimeType: 'audio/webm' })
      audioChunks = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' })
        recordingBlob.value = blob
        revokeUserAudioUrl()
        userAudioUrl.value = URL.createObjectURL(blob)
        stopRecordingStream()
        // 提取波形数据（简化：读取 WebM 音频的波形）
        userWaveformSamples.value = await extractWaveformFromBlob(blob)
        mediaRecorder = null
      }

      mediaRecorder.start()
      isRecording.value = true
    } catch (err) {
      stopRecordingStream()
      app.showSubtitleToast(typeof err === 'string' ? err : String(err), 'error')
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    } else {
      stopRecordingStream()
      mediaRecorder = null
    }
    isRecording.value = false
  }

  async function playUserRecording(mode: 'recording' | 'comparison' = 'recording') {
    if (!userAudioUrl.value) return

    stopPlayback()
    await player.clearSentenceSegment({ pausePlayback: true })
    playbackToken += 1
    const currentToken = playbackToken
    activePlaybackMode.value = mode

    try {
      const audio = new Audio(userAudioUrl.value)
      activeAudio = audio
      audio.onended = () => {
        if (currentToken !== playbackToken) return
        clearActiveAudio()
        activePlaybackMode.value = null
      }
      audio.onerror = () => {
        if (currentToken !== playbackToken) return
        clearActiveAudio()
        activePlaybackMode.value = null
        app.showSubtitleToast('录音播放失败', 'error')
      }
      await audio.play()
    } catch (error) {
      clearActiveAudio()
      activePlaybackMode.value = null
      app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
    }
  }

  async function playComparison() {
    if (!userAudioUrl.value) return

    const sentence = transcript.sentences[player.currentIndex]
    const startedOriginal = await player.playSentenceSegment(sentence?.start_ms, sentence?.end_ms)
    if (!startedOriginal) {
      app.showSubtitleToast('当前句缺少时间戳，无法播放原音对比', 'error')
      return
    }

    await playUserRecording('comparison')
  }

  async function saveRecording(path: string) {
    if (!recordingBlob.value) return
    try {
      const arrayBuffer = await recordingBlob.value.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      await invoke('save_recording', { path, data: Array.from(uint8Array) })
    } catch (error) {
      app.showSubtitleToast(typeof error === 'string' ? error : String(error), 'error')
    }
  }

  /**
   * 从 Blob 提取简化波形数据
   * 使用 Web Audio API 解码并降采样
   */
  async function extractWaveformFromBlob(blob: Blob): Promise<number[]> {
    let audioContext: AudioContext | null = null
    try {
      const arrayBuffer = await blob.arrayBuffer()
      audioContext = new AudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      const channelData = audioBuffer.getChannelData(0)
      if (channelData.length === 0) return []

      const numSamples = 200
      const step = Math.max(1, Math.floor(channelData.length / numSamples))
      const samples: number[] = []
      for (let i = 0; i < numSamples; i++) {
        const start = Math.min(i * step, channelData.length)
        const end = Math.min(start + step, channelData.length)
        if (start >= end) {
          samples.push(0)
          continue
        }

        let sum = 0
        for (let j = start; j < end; j++) {
          sum += Math.abs(channelData[j])
        }
        samples.push(sum / (end - start))
      }

      // 归一化到 0-1
      const max = Math.max(...samples, 0.01)
      return samples.map(s => s / max)
    } catch {
      return []
    } finally {
      if (audioContext) {
        await audioContext.close().catch(() => {})
      }
    }
  }

  return {
    isRecording,
    userAudioUrl,
    userWaveformSamples,
    activePlaybackMode,
    toggleRecording,
    playUserRecording,
    playComparison,
    saveRecording,
    stopPlayback,
  }
})

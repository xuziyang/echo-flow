// src/stores/useRecordingStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export const useRecordingStore = defineStore('recording', () => {
  const isRecording = ref(false)
  const userAudioUrl = ref<string | null>(null)
  const userWaveformSamples = ref<number[]>([])
  const recordingBlob = ref<Blob | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []

  async function toggleRecording() {
    if (isRecording.value) {
      stopRecording()
    } else {
      await startRecording()
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunks = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' })
        recordingBlob.value = blob
        userAudioUrl.value = URL.createObjectURL(blob)
        stream.getTracks().forEach(t => t.stop())
        // 提取波形数据（简化：读取 WebM 音频的波形）
        userWaveformSamples.value = await extractWaveformFromBlob(blob)
      }

      mediaRecorder.start()
      isRecording.value = true
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    isRecording.value = false
  }

  async function playComparison() {
    if (userAudioUrl.value) {
      const audio = new Audio(userAudioUrl.value)
      await audio.play()
    }
  }

  async function saveRecording(path: string) {
    if (!recordingBlob.value) return
    const arrayBuffer = await recordingBlob.value.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    await invoke('save_recording', { path, data: Array.from(uint8Array) })
  }

  /**
   * 从 Blob 提取简化波形数据
   * 使用 Web Audio API 解码并降采样
   */
  async function extractWaveformFromBlob(blob: Blob): Promise<number[]> {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioContext = new AudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      const channelData = audioBuffer.getChannelData(0)
      const numSamples = 200
      const step = Math.floor(channelData.length / numSamples)
      const samples: number[] = []
      for (let i = 0; i < numSamples; i++) {
        let sum = 0
        for (let j = 0; j < step; j++) {
          sum += Math.abs(channelData[i * step + j])
        }
        samples.push(sum / step)
      }
      // 归一化到 0-1
      const max = Math.max(...samples, 0.01)
      await audioContext.close()
      return samples.map(s => s / max)
    } catch {
      return []
    }
  }

  return {
    isRecording,
    userAudioUrl,
    userWaveformSamples,
    toggleRecording,
    playComparison,
    saveRecording,
  }
})

// src/stores/useRecordingStore.ts
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'
import { usePlayerStore } from './usePlayerStore'
import { useSettingsStore } from './useSettingsStore'
import { useTranscriptStore } from './useTranscriptStore'
import { toErrorMessage } from '../utils/errors'

interface RecordingResult {
  samples: number[]
  sample_rate: number
  channels: number
}

interface StoredRecording {
  audioUrl: string
  samples: number[]
  waveformSamples: number[]
  sampleRate: number
  channels: number
  durationMs: number
}

export type LoopPlaybackMode = 'original' | 'comparison'
type UserPlaybackMode = 'recording' | 'comparison'

interface UserRecordingPlaybackOptions {
  waitForEnd?: boolean
  stopBeforeStart?: boolean
  allowDuringLoop?: boolean
}

export const useRecordingStore = defineStore('recording', () => {
  const app = useAppStore()
  const player = usePlayerStore()
  const settings = useSettingsStore()
  const transcript = useTranscriptStore()
  const isRecording = ref(false)
  const userAudioUrl = ref<string | null>(null)
  const userWaveformSamples = ref<number[]>([])
  const recordingSamples = ref<number[]>([])
  const recordingsBySentence = ref<Record<string, StoredRecording>>({})
  const activePlaybackMode = ref<UserPlaybackMode | null>(null)
  const comparisonActive = ref(false)
  const loopEnabled = ref(false)
  const autoRecordEnabled = ref(false)
  const activeLoopMode = ref<LoopPlaybackMode | null>(null)
  const recordingSampleRate = ref(44100)
  const recordingChannels = ref(1)
  const recordingDurationMs = ref(0)
  const hasRecording = computed(() => Boolean(getCurrentSentenceRecording()) || Boolean(userAudioUrl.value) || recordingSamples.value.length > 0)

  let htmlAudio: HTMLAudioElement | null = null
  let playbackToken = 0
  let loopToken = 0
  let resolveActivePlayback: ((completed: boolean) => void) | null = null
  let waveformTimer: ReturnType<typeof setInterval> | null = null
  let audioContext: AudioContext | null = null
  let audioBufferSource: AudioBufferSourceNode | null = null
  let recordingSentenceIndex = 0
  let recordingCacheDirectory: string | null = null

  function showErrorToast(error: unknown) {
    app.showSubtitleToast(toErrorMessage(error), 'error')
  }

  /* 是否有进行中的录音 / 播放（循环可通过 allowDuringLoop 豁免） */
  function isPlaybackBusy(options?: { allowDuringLoop?: boolean }): boolean {
    return Boolean(
      isRecording.value
      || activePlaybackMode.value
      || (!options?.allowDuringLoop && activeLoopMode.value)
      || player.isPlaying
      || player.seeking,
    )
  }

  function clearActiveAudio() {
    if (audioBufferSource) {
      try {
        audioBufferSource.stop()
      } catch {
        // The source may already have ended.
      }
      audioBufferSource = null
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
      audioContext = null
    }
    if (htmlAudio) {
      htmlAudio.pause()
      htmlAudio.currentTime = 0
      htmlAudio = null
    }
  }

  async function stopPlayback() {
    playbackToken += 1
    loopToken += 1
    resolveActivePlayback?.(false)
    resolveActivePlayback = null
    clearActiveAudio()
    activePlaybackMode.value = null
    activeLoopMode.value = null
    comparisonActive.value = false
    await player.clearSentenceSegment({ pausePlayback: true })
  }

  async function toggleRecording() {
    if (isRecording.value) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }

  async function startRecording() {
    if (activeLoopMode.value) {
      await stopPlayback()
    }
    if (activePlaybackMode.value || player.isPlaying || player.seeking) return

    try {
      await stopPlayback()
      await player.clearSentenceSegment({ pausePlayback: true })
      await invoke('start_recording', {
        deviceId: settings.selectedInputId || null,
      })
      recordingSentenceIndex = player.currentIndex
      userWaveformSamples.value = []
      startWaveformPolling()
      isRecording.value = true
    } catch (err) {
      stopWaveformPolling()
      showErrorToast(err)
    }
  }

  async function stopRecording(options?: { silent?: boolean }) {
    if (!isRecording.value) return

    try {
      const result = (await invoke('stop_recording')) as RecordingResult
      recordingSamples.value = result.samples
      recordingSampleRate.value = result.sample_rate
      recordingChannels.value = result.channels || 1
      recordingDurationMs.value = result.sample_rate > 0
        ? Math.round((result.samples.length / result.sample_rate / recordingChannels.value) * 1000)
        : 0

      // Convert samples to audio URL for playback
      if (recordingSamples.value.length > 0) {
        storeSentenceRecording(recordingSentenceIndex)
        await saveCurrentSentenceRecording(recordingSentenceIndex, { silentSuccess: options?.silent })
      }
    } catch (err) {
      showErrorToast(err)
    } finally {
      stopWaveformPolling()
      isRecording.value = false
    }
  }

  /// 录音设备丢失：提示用户并停止录音，保留已录制部分（静默保存成功提示）。
  async function handleRecordingDeviceLost() {
    if (!isRecording.value) return
    app.showSubtitleToast('录音设备已断开，已保留已录制部分', 'error')
    await stopRecording({ silent: true })
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

  function getSentenceId(sentenceIndex: number) {
    const sentence = transcript.sentences[sentenceIndex]
    return sentence?.id ?? null
  }

  function getSentenceRecordingKey(sentenceIndex: number) {
    const sentenceId = getSentenceId(sentenceIndex)
    return `${player.currentPath || 'no-audio'}::${sentenceId ?? 'no-id'}`
  }

  function getLegacySentenceRecordingKey(sentenceIndex: number) {
    const sentenceId = getSentenceId(sentenceIndex)
    return `${player.currentPath || 'no-audio'}::${sentenceIndex}::${sentenceId ?? 'no-id'}`
  }

  function getCurrentSentenceRecording() {
    return recordingsBySentence.value[getSentenceRecordingKey(player.currentIndex)]
      ?? recordingsBySentence.value[getLegacySentenceRecordingKey(player.currentIndex)]
      ?? null
  }

  function hasRecordingForSentence(sentenceIndex: number) {
    return Boolean(
      recordingsBySentence.value[getSentenceRecordingKey(sentenceIndex)]
      ?? recordingsBySentence.value[getLegacySentenceRecordingKey(sentenceIndex)],
    )
  }

  function applyStoredRecording(recording: StoredRecording | null) {
    if (!recording) {
      userAudioUrl.value = null
      userWaveformSamples.value = []
      recordingSamples.value = []
      recordingSampleRate.value = 44100
      recordingChannels.value = 1
      recordingDurationMs.value = 0
      return
    }

    userAudioUrl.value = recording.audioUrl
    userWaveformSamples.value = recording.waveformSamples
    recordingSamples.value = recording.samples
    recordingSampleRate.value = recording.sampleRate
    recordingChannels.value = recording.channels
    recordingDurationMs.value = recording.durationMs
  }

  function syncCurrentSentenceRecording() {
    applyStoredRecording(getCurrentSentenceRecording())
  }

  function storeSentenceRecording(sentenceIndex: number) {
    const key = getSentenceRecordingKey(sentenceIndex)
    const previousRecording = recordingsBySentence.value[key]
    if (previousRecording?.audioUrl) {
      URL.revokeObjectURL(previousRecording.audioUrl)
    }

    const samples = [...recordingSamples.value]
    const sampleRate = recordingSampleRate.value
    const channels = recordingChannels.value
    const waveformSamples = extractWaveformFromSamples(samples, 640)
    const audioData = createWavFromSamples(samples, sampleRate, channels)
    const blob = new Blob([audioData], { type: 'audio/wav' })
    const audioUrl = URL.createObjectURL(blob)
    const durationMs = sampleRate > 0
      ? Math.round((samples.length / sampleRate / channels) * 1000)
      : 0

    recordingsBySentence.value = {
      ...recordingsBySentence.value,
      [key]: {
        audioUrl,
        samples,
        waveformSamples,
        sampleRate,
        channels,
        durationMs,
      },
    }

    if (sentenceIndex === player.currentIndex) {
      applyStoredRecording(recordingsBySentence.value[key])
    }
  }

  function isRecordingKeyForAudio(key: string, audioPath: string) {
    return key.startsWith(`${audioPath}::`)
  }

  async function clearRecordingsForAudio(audioPath: string): Promise<boolean> {
    if (!audioPath) return true
    if (isRecording.value) {
      app.showSubtitleToast('请先停止录音，再重新生成字幕', 'error')
      return false
    }

    await stopPlayback()

    try {
      await invoke('delete_recordings_for_audio', { audioPath })
    } catch (error) {
      showErrorToast(error)
      return false
    }

    const nextRecordings: Record<string, StoredRecording> = {}
    for (const [key, recording] of Object.entries(recordingsBySentence.value)) {
      if (isRecordingKeyForAudio(key, audioPath)) {
        URL.revokeObjectURL(recording.audioUrl)
      } else {
        nextRecordings[key] = recording
      }
    }
    recordingsBySentence.value = nextRecordings

    if (player.currentPath === audioPath) {
      applyStoredRecording(null)
    }

    return true
  }

  async function clearCurrentAudioRecordings(): Promise<boolean> {
    return await clearRecordingsForAudio(player.currentPath)
  }

  function sanitizePathSegment(segment: string) {
    const sanitized = segment
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^\.+$/, '')
      .slice(0, 80)

    return sanitized || 'audio'
  }

  function getPathStem(path: string) {
    const fileName = path.split(/[\\/]/).pop() || 'audio'
    const dotIndex = fileName.lastIndexOf('.')
    return sanitizePathSegment(dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName)
  }

  async function getRecordingCacheDirectory() {
    if (recordingCacheDirectory) return recordingCacheDirectory
    recordingCacheDirectory = await invoke<string>('get_recording_cache_dir')
    return recordingCacheDirectory
  }

  function joinPath(...segments: string[]) {
    return segments
      .map((segment, index) => {
        if (index === 0) return segment.replace(/[\\/]+$/g, '')
        return segment.replace(/^[\\/]+|[\\/]+$/g, '')
      })
      .filter(Boolean)
      .join('/')
  }

  async function getSentenceRecordingPath(sentenceIndex: number) {
    const audioPath = player.currentPath
    if (!audioPath) return null

    const audioStem = getPathStem(audioPath)
    const baseDirectory = joinPath(await getRecordingCacheDirectory(), audioStem)

    const sentence = transcript.sentences[sentenceIndex]
    const sentenceId = sentence?.id ?? null
    if (!sentenceId) return null

    return joinPath(baseDirectory, `sentence-${sentenceId}.wav`)
  }

  async function saveCurrentSentenceRecording(
    sentenceIndex: number,
    options?: { silentSuccess?: boolean },
  ) {
    const path = await getSentenceRecordingPath(sentenceIndex)
    if (!path) return

    try {
      await saveRecording(path)
      if (!options?.silentSuccess) {
        const fileName = path.split(/[\\/]/).pop() || 'recording.wav'
        app.showSubtitleToast(`录音已保存：${fileName}`)
      }
    } catch (error) {
      showErrorToast(error)
    }
  }

  function createPlaybackEndHandler(currentToken: number, onEnd?: (completed: boolean) => void) {
    return () => {
      if (currentToken !== playbackToken) return
      clearActiveAudio()
      activePlaybackMode.value = null
      comparisonActive.value = false
      onEnd?.(true)
    }
  }

  async function startUserRecordingPlayback(
    mode: UserPlaybackMode = 'recording',
    {
      waitForEnd = false,
      stopBeforeStart = true,
      allowDuringLoop = false,
    }: UserRecordingPlaybackOptions = {},
  ): Promise<boolean> {
    const sentenceRecording = getCurrentSentenceRecording()
    const samples = sentenceRecording?.samples ?? recordingSamples.value
    const sampleRate = sentenceRecording?.sampleRate ?? recordingSampleRate.value
    const audioUrl = sentenceRecording?.audioUrl ?? userAudioUrl.value

    if (!sentenceRecording && !audioUrl && samples.length === 0) return false
    // 注意：不检查 activePlaybackMode —— 旧录音由下方 stopPlayback / clearActiveAudio 停掉
    if (
      isRecording.value
      || player.isPlaying
      || player.seeking
      || (!allowDuringLoop && activeLoopMode.value)
    ) {
      return false
    }

    if (stopBeforeStart) {
      await stopPlayback()
    } else {
      playbackToken += 1
      clearActiveAudio()
      activePlaybackMode.value = null
    }

    await player.clearSentenceSegment({ pausePlayback: true })
    playbackToken += 1
    const currentToken = playbackToken
    activePlaybackMode.value = mode

    return await new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (completed: boolean) => {
        if (settled) return
        settled = true
        if (resolveActivePlayback === finish) {
          resolveActivePlayback = null
        }
        resolve(completed)
      }
      resolveActivePlayback = finish

      try {
        if (samples.length > 0) {
          audioContext = new AudioContext()
          const audioBuffer = audioContext.createBuffer(
            1,
            samples.length,
            sampleRate,
          )
          const channelData = new Float32Array(samples)
          audioBuffer.copyToChannel(channelData, 0)

          audioBufferSource = audioContext.createBufferSource()
          audioBufferSource.buffer = audioBuffer
          audioBufferSource.connect(audioContext.destination)
          audioBufferSource.onended = createPlaybackEndHandler(currentToken, finish)
          audioBufferSource.start()
        } else {
          const audio = new Audio(audioUrl!)
          htmlAudio = audio
          audio.onended = createPlaybackEndHandler(currentToken, finish)
          audio.onerror = () => {
            createPlaybackEndHandler(currentToken, finish)()
            app.showSubtitleToast('录音播放失败', 'error')
          }
          void audio.play().then(() => {
            if (!waitForEnd) finish(true)
          }).catch((error) => {
            clearActiveAudio()
            activePlaybackMode.value = null
            showErrorToast(error)
            finish(false)
          })
        }
        if (!waitForEnd && samples.length > 0) finish(true)
      } catch (error) {
        clearActiveAudio()
        activePlaybackMode.value = null
        showErrorToast(error)
        finish(false)
      }
    })
  }

  async function playUserRecording(mode: UserPlaybackMode = 'recording') {
    await startUserRecordingPlayback(mode)
  }

  function getCurrentSentenceTiming() {
    const sentence = transcript.sentences[player.currentIndex]
    return {
      startMs: sentence?.start_ms,
      endMs: sentence?.end_ms,
    }
  }

  async function playOriginalOnce(showMissingTimestampToast = true): Promise<boolean> {
    if (isPlaybackBusy()) return false

    const { startMs, endMs } = getCurrentSentenceTiming()
    // 仅当真的缺少时间戳时提示；播放中被取消也返回 false，但属于正常中断，不提示
    if (!player.canPlaySentenceSegment(startMs, endMs)) {
      if (showMissingTimestampToast) {
        app.showSubtitleToast('当前句缺少时间戳，无法播放原音', 'error')
      }
      return false
    }

    return await player.playSentenceSegment(startMs, endMs)
  }

  async function playComparisonOnce(options?: { waitForRecordingEnd?: boolean, allowDuringLoop?: boolean }) {
    if (!hasRecording.value) {
      app.showSubtitleToast('请先完成录音，再播放对比', 'error')
      return false
    }
    if (isPlaybackBusy({ allowDuringLoop: options?.allowDuringLoop })) return false

    comparisonActive.value = true
    const { startMs, endMs } = getCurrentSentenceTiming()
    // 仅当真的缺少时间戳时提示；对照第一阶段被取消也返回 false，属于正常中断，不提示
    if (!player.canPlaySentenceSegment(startMs, endMs)) {
      comparisonActive.value = false
      app.showSubtitleToast('当前句缺少时间戳，无法播放原音对比', 'error')
      return false
    }

    const startedOriginal = await player.playSentenceSegment(startMs, endMs)
    if (!startedOriginal) {
      comparisonActive.value = false
      return false
    }

    const completed = await startUserRecordingPlayback('comparison', {
      waitForEnd: options?.waitForRecordingEnd,
      stopBeforeStart: false,
      allowDuringLoop: options?.allowDuringLoop,
    })
    if (!completed) comparisonActive.value = false
    return completed
  }

  async function playOriginal() {
    if (loopEnabled.value) {
      await toggleOriginalLoop()
      return
    }

    const completed = await playOriginalOnce()
    if (completed && autoRecordEnabled.value) {
      await startRecording()
    }
  }

  async function playComparison() {
    if (loopEnabled.value) {
      await toggleComparisonLoop()
      return
    }

    await playComparisonOnce()
  }

  function setLoopEnabled(enabled: boolean) {
    if (loopEnabled.value === enabled) return
    loopEnabled.value = enabled
    if (!enabled && activeLoopMode.value) {
      void stopPlayback()
    }
  }

  function toggleLoopEnabled() {
    setLoopEnabled(!loopEnabled.value)
  }

  function setAutoRecordEnabled(enabled: boolean) {
    autoRecordEnabled.value = enabled
  }

  function toggleAutoRecordEnabled() {
    setAutoRecordEnabled(!autoRecordEnabled.value)
  }

  async function toggleOriginalLoop() {
    if (activeLoopMode.value === 'original') {
      await stopPlayback()
      return
    }
    if (activeLoopMode.value) {
      await stopPlayback()
    }
    if (isPlaybackBusy()) return

    const { startMs, endMs } = getCurrentSentenceTiming()
    if (!player.canPlaySentenceSegment(startMs, endMs)) {
      app.showSubtitleToast('当前句缺少时间戳，无法循环播放原音', 'error')
      return
    }

    activeLoopMode.value = 'original'
    const currentLoopToken = ++loopToken

    while (activeLoopMode.value === 'original' && currentLoopToken === loopToken) {
      const { startMs: currentStartMs, endMs: currentEndMs } = getCurrentSentenceTiming()
      const completed = await player.playSentenceSegment(currentStartMs, currentEndMs)
      if (activeLoopMode.value !== 'original' || currentLoopToken !== loopToken) break
      if (!completed) {
        app.showSubtitleToast('当前句缺少时间戳，无法循环播放原音', 'error')
        await stopPlayback()
        break
      }
    }
  }

  async function toggleComparisonLoop() {
    if (activeLoopMode.value === 'comparison') {
      await stopPlayback()
      return
    }
    if (activeLoopMode.value) {
      await stopPlayback()
    }
    if (isPlaybackBusy()) return

    if (!hasRecording.value) {
      app.showSubtitleToast('请先完成录音，再循环播放对比', 'error')
      return
    }

    const { startMs, endMs } = getCurrentSentenceTiming()
    if (!player.canPlaySentenceSegment(startMs, endMs)) {
      app.showSubtitleToast('当前句缺少时间戳，无法循环播放对比', 'error')
      return
    }

    activeLoopMode.value = 'comparison'
    const currentLoopToken = ++loopToken

    while (activeLoopMode.value === 'comparison' && currentLoopToken === loopToken) {
      const completed = await playComparisonOnce({
        waitForRecordingEnd: true,
        allowDuringLoop: true,
      })
      if (activeLoopMode.value !== 'comparison' || currentLoopToken !== loopToken) break
      if (!completed) {
        await stopPlayback()
        break
      }
    }
  }

  async function saveRecording(path: string) {
    if (recordingSamples.value.length === 0) return
    await invoke('save_recording', {
      path,
      samples: recordingSamples.value,
      sampleRate: recordingSampleRate.value,
      channels: recordingChannels.value,
    })
  }

  watch(
    () => [player.currentPath, player.currentIndex] as const,
    () => {
      if (isRecording.value) return
      syncCurrentSentenceRecording()
    },
  )

  return {
    isRecording,
    userAudioUrl,
    userWaveformSamples,
    recordingDurationMs,
    hasRecording,
    activePlaybackMode,
    comparisonActive,
    loopEnabled,
    autoRecordEnabled,
    activeLoopMode,
    setLoopEnabled,
    toggleLoopEnabled,
    setAutoRecordEnabled,
    toggleAutoRecordEnabled,
    toggleRecording,
    handleRecordingDeviceLost,
    playOriginal,
    playUserRecording,
    playComparison,
    toggleOriginalLoop,
    toggleComparisonLoop,
    saveRecording,
    stopPlayback,
    hasRecordingForSentence,
    clearRecordingsForAudio,
    clearCurrentAudioRecordings,
  }
})

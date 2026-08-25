import { describe, expect, it } from 'vitest'
import { isMissingModelError, toErrorMessage, toUserTranscribeError } from './errors'

describe('errors', () => {
  it('detects missing-model path errors', () => {
    expect(isMissingModelError('Whisper model not found at /tmp/ggml-base.en.bin')).toBe(true)
    expect(isMissingModelError('VAD model not found. Expected one of: /tmp/silero_vad.onnx')).toBe(true)
    expect(isMissingModelError('startup failed')).toBe(false)
  })

  it('maps missing-model errors to user-facing copy', () => {
    expect(toUserTranscribeError('Whisper model not found at /tmp/ggml-base.en.bin')).toBe('还没安装识别模型')
    expect(toUserTranscribeError('VAD model not found at /tmp/silero_vad.onnx')).toBe('还没安装语音检测模型')
    expect(toUserTranscribeError('Aligner vocab not found at /tmp/wav2vec2-vocab.json')).toBe('还没安装时间对齐模型')
    expect(toUserTranscribeError('startup failed')).toBe('startup failed')
  })

  it('reads Error.message when mapping unknown errors', () => {
    expect(toErrorMessage(new Error('disk full'))).toBe('disk full')
  })
})

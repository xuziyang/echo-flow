/** Tauri invoke 抛出的错误可能是字符串或 Error，统一转成可展示的文本 */
export function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

export function isMissingModelError(error: unknown): boolean {
  const message = toErrorMessage(error)
  return /not found at |not found\. Expected one of:/i.test(message)
}

export function toUserTranscribeError(error: unknown): string {
  const message = toErrorMessage(error)
  if (/Whisper model not found/i.test(message)) return '还没安装识别模型'
  if (/VAD model not found/i.test(message)) return '还没安装语音检测模型'
  if (/Aligner (model|vocab) not found/i.test(message)) return '还没安装时间对齐模型'
  return message
}

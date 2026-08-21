/** Tauri invoke 抛出的错误可能是字符串或 Error，统一转成可展示的文本 */
export function toErrorMessage(error: unknown): string {
  return typeof error === 'string' ? error : String(error)
}

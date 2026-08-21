// src/composables/useConfirmDialog.ts
import { reactive } from 'vue'

export interface ConfirmDialogOptions {
  title: string
  keep?: string[]
  lose?: string[]
  note?: string
  okText?: string
  onOk?: () => void
}

interface ConfirmDialogState {
  visible: boolean
  title: string
  keep: string[]
  lose: string[]
  note: string
  okText: string
  onOk: (() => void) | null
}

const state = reactive<ConfirmDialogState>({
  visible: false,
  title: '',
  keep: [],
  lose: [],
  note: '',
  okText: '确定',
  onOk: null,
})

export function useConfirmDialog() {
  function confirmDialog(options: ConfirmDialogOptions) {
    state.title = options.title
    state.keep = options.keep ?? []
    state.lose = options.lose ?? []
    state.note = options.note ?? ''
    state.okText = options.okText ?? '确定'
    state.onOk = options.onOk ?? null
    state.visible = true
  }

  function close() {
    state.visible = false
  }

  function confirm() {
    state.visible = false
    state.onOk?.()
  }

  return { state, confirmDialog, close, confirm }
}

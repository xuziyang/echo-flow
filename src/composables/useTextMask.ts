// src/composables/useTextMask.ts
import { ref } from 'vue'

/** 听力遮蔽模式：按词打码成灰块（全局共享状态） */
const maskText = ref(false)

export function useTextMask() {
  function toggleMask() {
    maskText.value = !maskText.value
  }

  return { maskText, toggleMask }
}

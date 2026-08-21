<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useConfirmDialog } from '../../composables/useConfirmDialog'

const { state, close, confirm } = useConfirmDialog()

function onKeydown(e: KeyboardEvent) {
  if (!state.visible || e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  close()
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))
onUnmounted(() => window.removeEventListener('keydown', onKeydown, { capture: true }))
</script>

<template>
  <div v-if="state.visible" class="overlay" @click.self="close">
    <div class="dialog" role="dialog" aria-modal="true">
      <h3>{{ state.title }}</h3>
      <div v-if="state.keep.length || state.lose.length" class="kv">
        <div class="col keep">
          <div class="h">保留</div>
          <ul>
            <li v-for="(item, i) in state.keep" :key="i">✓ {{ item }}</li>
          </ul>
        </div>
        <div class="col lose">
          <div class="h">丢失</div>
          <ul>
            <li v-for="(item, i) in state.lose" :key="i">✕ {{ item }}</li>
          </ul>
        </div>
      </div>
      <div v-if="state.note" class="note">{{ state.note }}</div>
      <div class="actions">
        <button class="btn" @click="close">取消</button>
        <button class="btn btn-danger" @click="confirm">{{ state.okText }}</button>
      </div>
    </div>
  </div>
</template>

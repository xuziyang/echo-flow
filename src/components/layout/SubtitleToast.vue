<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import Icon from '../Icon.vue'
const app = useAppStore()
</script>

<template>
  <div id="toasts">
    <Transition name="toast">
      <div v-if="app.toast" class="toast" :class="{ err: app.toastType === 'error' }">
        <Icon
          :name="app.toastType === 'error' ? 'alert' : 'check'"
          :size="14"
          :stroke-width="1.8"
          :style="{ color: app.toastType === 'error' ? 'var(--red)' : 'var(--accent)', flex: 'none' }"
        />
        <span>{{ app.toast }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active { transition: opacity .25s, transform .25s; }
.toast-leave-active { transition: opacity .3s, transform .3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(14px); }
</style>

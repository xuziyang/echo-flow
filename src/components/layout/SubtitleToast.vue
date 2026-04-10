<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import Icon from '../Icon.vue'
const app = useAppStore()
</script>

<template>
  <Transition>
    <div v-if="app.toast"
         class="absolute bottom-6 right-6 px-4 py-3 rounded-2xl border shadow-xl text-sm z-40"
         :class="app.toastType === 'error'
           ? (app.theme === 'dark' ? 'bg-red-950/95 border-red-900 text-red-50' : 'bg-red-50 border-red-200 text-red-800')
           : (app.theme === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-slate-700')">
      <div class="flex items-center gap-3">
        <Icon :name="app.toastType === 'error' ? 'triangle-exclamation' : 'check'"
              :class="app.toastType === 'error' ? 'text-red-400' : 'text-emerald-500'" />
        <span>{{ app.toast }}</span>
      </div>
    </div>
  </Transition>
</template>

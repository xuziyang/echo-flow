<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
const app = useAppStore()
</script>

<template>
  <Transition>
    <div v-if="app.toast"
         class="absolute bottom-6 right-6 px-4 py-3 rounded-2xl border shadow-xl text-sm z-40"
         :class="app.theme === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-slate-700'">
      <div class="flex items-center gap-3">
        <i class="fa-solid fa-check text-emerald-500"></i>
        <span>{{ app.toast }}</span>
      </div>
    </div>
  </Transition>
</template>

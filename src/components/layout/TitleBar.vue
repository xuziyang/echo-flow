<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
const app = useAppStore()
</script>

<template>
  <div class="h-10 flex-shrink-0 flex items-center justify-between px-5 border-b select-none z-50 transition-colors duration-300"
       :class="app.theme === 'dark' ? 'bg-dark-card border-white/5 text-gray-400' : 'bg-white border-gray-200 text-gray-500'"
       style="-webkit-app-region: drag">
    <div class="flex gap-2 items-center w-20">
      <div class="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]/20 shadow-sm cursor-pointer hover:bg-[#ff5f57]/80"></div>
      <div class="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24]/20 shadow-sm cursor-pointer hover:bg-[#febc2e]/80"></div>
      <div class="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29]/20 shadow-sm cursor-pointer hover:bg-[#28c840]/80"></div>
    </div>
    <div class="text-xs font-semibold opacity-70 tracking-widest uppercase font-mono">EchoFlow</div>
    <div class="w-24 flex justify-end gap-4 text-xs opacity-60 items-center" style="-webkit-app-region: no-drag">
      <button @click="app.toggleTheme()" class="hover:text-brand-500 cursor-pointer transition-colors focus:outline-none">
        <i :class="app.theme === 'dark' ? 'fa-sun' : 'fa-moon'" class="fa-solid"></i>
      </button>
      <button @click="app.openSettings()" class="hover:text-brand-500 cursor-pointer transition-colors focus:outline-none">
        <i class="fa-solid fa-gear"></i>
      </button>
      <i class="fa-regular fa-bell hover:text-brand-500 cursor-pointer transition-colors"></i>
    </div>
  </div>
</template>

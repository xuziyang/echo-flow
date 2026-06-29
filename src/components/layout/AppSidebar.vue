<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { useFilesStore } from '../../stores/useFilesStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const files = useFilesStore()
</script>

<template>
  <div class="w-64 border-r flex flex-col flex-shrink-0 z-20 transition-all duration-300"
       :class="{
         'w-0 opacity-0 overflow-hidden': !app.showSidebar,
         'bg-dark-bg border-gray-800/50': app.theme === 'dark',
         'bg-gray-50 border-gray-200': app.theme !== 'dark'
       }">
    <div class="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 transition-colors duration-300"
         :class="app.theme === 'dark' ? 'border-gray-800/50' : 'border-gray-200'">
      <h2 class="font-bold text-xs tracking-wider" :class="app.theme === 'dark' ? 'text-gray-400' : 'text-slate-500'">Library</h2>
      <button @click="files.openFile()" class="w-6 h-6 rounded flex items-center justify-center transition-colors"
              :class="app.theme === 'dark' ? 'hover:bg-white/10 text-gray-500 hover:text-gray-300' : 'hover:bg-slate-200 text-slate-400'">
        <Icon name="plus" class="text-xs" />
      </button>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
      <div v-for="file in files.files" :key="file.path"
           @click="files.openRecentFile(file)"
           class="p-3 rounded-lg border cursor-pointer transition-all group relative"
           :class="files.currentFile?.path === file.path ?
              (app.theme === 'dark' ? 'bg-white/5 border-brand-500/30 shadow-sm' : 'bg-white border-brand-300 shadow-sm') :
              (app.theme === 'dark' ? 'border-transparent hover:bg-white/5' : 'hover:bg-white hover:shadow-sm border-transparent')">
        <h3 class="text-xs font-bold leading-snug mb-1"
            :class="files.currentFile?.path === file.path
               ? (app.theme === 'dark' ? 'text-brand-400' : 'text-brand-700')
               : (app.theme === 'dark' ? 'text-gray-300' : 'text-slate-700')">
          {{ file.title }}
        </h3>
        <div class="flex justify-between text-[10px]" :class="app.theme === 'dark' ? 'text-gray-500' : 'text-slate-400'">
          <span>{{ file.date }}</span>
          <span>{{ files.formatDuration(file.duration_ms) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

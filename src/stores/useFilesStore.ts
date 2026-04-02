// src/stores/useFilesStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface FileItem {
  id: number
  title: string
  date: string
  duration: string
}

export const useFilesStore = defineStore('files', () => {
  const files = ref<FileItem[]>([
    { id: 1, title: "Lesson 1: Mastering Daily Greetings", date: "2h ago", duration: "01:30" },
    { id: 2, title: "TED: The Power of Introverts", date: "Yesterday", duration: "12:45" },
    { id: 3, title: "Business Meeting 101", date: "3d ago", duration: "05:30" },
  ])

  function simulateUpload() { /* TODO: wire to file upload API */ }

  return { files, simulateUpload }
})

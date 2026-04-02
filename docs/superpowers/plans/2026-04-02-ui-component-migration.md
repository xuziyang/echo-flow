# EchoFlow UI 原型迁移：Vue 组件树 + Pinia 状态

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `ui/index.html` Alpine.js 静态原型迁移为 18 个 Vue 组件 + 6 个 Pinia Store，完整还原 UI 结构和交互状态，不含播放器/录音/Tauri 业务逻辑。

**Architecture:** 先搭建目录骨架和 Store 空壳，再按依赖顺序（叶节点→容器）逐组件填充模板和样式，最后补全 Store 逻辑。共享 CSS 提取到 `src/assets/ui-shared.css`。

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Pinia ^3.0.2, Tailwind CSS ^4.2.2, TypeScript

---

## 文件结构

```
src/
├── App.vue                      # 根组件：布局 + mode 路由
├── main.ts                      # 挂载 Pinia
├── assets/
│   └── ui-shared.css           # 波形动画、滚动条、脉冲环等全局样式
├── components/
│   ├── layout/
│   │   ├── TitleBar.vue
│   │   ├── AppSidebar.vue
│   │   └── SubtitleToast.vue
│   ├── listening/
│   │   ├── ListeningView.vue
│   │   ├── PlayerCard.vue
│   │   │   ├── WaveformDisplay.vue
│   │   │   └── PlaybackControls.vue
│   │   ├── SubtitleToolbar.vue
│   │   └── SubtitleList.vue
│   │       ├── SubtitleCard.vue
│   │       └── SentenceEditor.vue
│   └── shadowing/
│       ├── ShadowingView.vue
│       ├── ShadowingWorkArea.vue
│       │   ├── WaveformComparison.vue
│       │   │   ├── OriginalWaveform.vue
│       │   │   └── UserWaveform.vue
│       │   └── RecordingFAB.vue
│       └── ShadowingScriptFlow.vue
│           └── ScriptFlowItem.vue
├── views/
│   └── SettingsView.vue
└── stores/
    ├── useAppStore.ts
    ├── usePlayerStore.ts
    ├── useTranscriptStore.ts
    ├── useRecordingStore.ts
    ├── useFilesStore.ts
    └── useSettingsStore.ts
```

---

## 前置步骤

- [ ] **Step 1: npm install pinia**

```bash
npm install
```

---

## 阶段一：目录骨架 + 空壳组件

### Task 1: 创建目录结构和共享样式

**Files:**
- Create: `src/assets/ui-shared.css`
- Create: `src/stores/`
- Create: `src/components/layout/`
- Create: `src/components/listening/`
- Create: `src/components/shadowing/`
- Create: `src/views/`

- [ ] **Step 1: 创建 ui-shared.css，提取全局动画和样式**

```css
/* src/assets/ui-shared.css */

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

@keyframes wave {
  0%, 100% { height: 30%; }
  50% { height: 100%; }
}
.animate-wave { animation: wave 1.2s infinite ease-in-out; }

@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(2); opacity: 0; }
}
.recording-ring::before {
  content: '';
  position: absolute;
  left: 0; top: 0; right: 0; bottom: 0;
  border-radius: 50%;
  border: 1px solid #ef4444;
  opacity: 0.5;
  animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background: #e4e4e7;
  margin-top: -4px;
  cursor: pointer;
  border: 2px solid #18181b;
}
input[type=range]::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
  cursor: pointer;
  background: #27272a;
  border-radius: 0px;
}
select {
  appearance: none;
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
  background-repeat: no-repeat;
  background-position: right 0.7rem top 50%;
  background-size: 0.65rem auto;
}
textarea::-webkit-scrollbar { width: 8px; }
textarea::-webkit-scrollbar-thumb {
  background: rgba(113, 113, 122, 0.35);
  border-radius: 999px;
}
```

- [ ] **Step 2: 创建所有目录**

```bash
mkdir -p src/stores src/components/layout src/components/listening src/components/shadowing src/views
```

- [ ] **Step 3: 提交**

```bash
git add src/assets/ui-shared.css && git commit -m "feat(ui): add shared CSS for animations and global styles"
```

---

### Task 2: 创建 6 个 Pinia Store 空壳

**Files:**
- Create: `src/stores/useAppStore.ts`
- Create: `src/stores/usePlayerStore.ts`
- Create: `src/stores/useTranscriptStore.ts`
- Create: `src/stores/useRecordingStore.ts`
- Create: `src/stores/useFilesStore.ts`
- Create: `src/stores/useSettingsStore.ts`

- [ ] **Step 1: 创建 useAppStore.ts（空壳）**

```ts
// src/stores/useAppStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const mode = ref<'listening' | 'shadowing' | 'settings'>('listening')
  const lastMode = ref('listening')
  const theme = ref<'dark' | 'light'>('dark')
  const showSidebar = ref(true)
  const currentTitle = ref('Lesson 1: Mastering Daily Greetings')
  const toast = ref('')
  const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
  function switchMode(m: 'listening' | 'shadowing' | 'settings') {
    if (mode.value !== 'settings') lastMode.value = mode.value
    mode.value = m
  }
  function openSettings() { switchMode('settings') }
  function closeSettings() { mode.value = lastMode.value }
  function toggleSidebar() { showSidebar.value = !showSidebar.value }
  function showSubtitleToast(message: string) {
    toast.value = message
    if (toastTimer.value) clearTimeout(toastTimer.value)
    toastTimer.value = setTimeout(() => { toast.value = '' }, 2200)
  }

  return { mode, lastMode, theme, showSidebar, currentTitle, toast, toastTimer,
           toggleTheme, switchMode, openSettings, closeSettings, toggleSidebar, showSubtitleToast }
})
```

- [ ] **Step 2: 创建 usePlayerStore.ts（空壳）**

```ts
// src/stores/usePlayerStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  const isPlaying = ref(false)
  const isLooping = ref(false)
  const currentIndex = ref(0)
  const volume = ref(80)
  const lastVolume = ref(80)
  const showEn = ref(true)
  const showZh = ref(false)

  function togglePlay() { isPlaying.value = !isPlaying.value }
  function toggleLoop() { isLooping.value = !isLooping.value }
  function toggleMute() {
    if (volume.value > 0) { lastVolume.value = volume.value; volume.value = 0 }
    else { volume.value = lastVolume.value || 80 }
  }
  function setVolume(v: number) { volume.value = v }
  function setCurrentIndex(i: number) { currentIndex.value = i }
  function prevSentence() { if (currentIndex.value > 0) currentIndex.value-- }
  function nextSentence() { currentIndex.value++ }
  function toggleEn() { showEn.value = !showEn.value }
  function toggleZh() { showZh.value = !showZh.value }

  return { isPlaying, isLooping, currentIndex, volume, lastVolume, showEn, showZh,
           togglePlay, toggleLoop, toggleMute, setVolume, setCurrentIndex,
           prevSentence, nextSentence, toggleEn, toggleZh }
})
```

- [ ] **Step 3: 创建 useTranscriptStore.ts（空壳）**

```ts
// src/stores/useTranscriptStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Sentence {
  id: number
  en: string
  zh: string
  status: 'saved' | 'new' | 'changed' | 'editing'
  dirty: boolean
  issues: string[]
}

export const useTranscriptStore = defineStore('transcript', () => {
  const sentences = ref<Sentence[]>([
    { id: 1, en: "Hey, how's it going?", zh: "嘿，最近怎么样？", status: 'saved', dirty: false, issues: [] },
    { id: 2, en: "Not bad, thanks for asking. How about you?", zh: "不错，谢谢关心。你呢？", status: 'saved', dirty: false, issues: [] },
    { id: 3, en: "I'm doing great! The weather is beautiful today, isn't it?", zh: "我很好！今天天气真好，不是吗？", status: 'saved', dirty: false, issues: [] },
    { id: 4, en: "It really is. Makes me want to go for a walk in the park.", zh: "确实是。让我想去公园散散步。", status: 'saved', dirty: false, issues: [] },
    { id: 5, en: "That sounds like a wonderful idea. Enjoy your day!", zh: "听起来是个好主意。祝你今天愉快！", status: 'saved', dirty: false, issues: [] },
    { id: 6, en: "You too, take care!", zh: "你也是，保重！", status: 'saved', dirty: false, issues: [] },
  ])
  const isEditing = ref(false)
  const editingIndex = ref<number | null>(null)
  const draftSentences = ref<Sentence[]>([])
  const hasUnsavedChanges = ref(false)
  const sentenceIdCounter = ref(7)

  const displaySentences = computed(() => isEditing.value ? draftSentences.value : sentences.value)

  function cloneSentence(s: Sentence): Sentence {
    return { ...s, issues: [...s.issues] }
  }
  function enterEditMode() {
    isEditing.value = true
    editingIndex.value = 0
    draftSentences.value = sentences.value.map(cloneSentence)
    draftSentences.value[0].status = 'editing'
    hasUnsavedChanges.value = false
  }
  function cancelEdits() {
    isEditing.value = false
    editingIndex.value = null
    draftSentences.value = []
    hasUnsavedChanges.value = false
  }
  function saveEdits() {
    sentences.value = draftSentences.value.map(s => ({ ...s, status: 'saved' as const, dirty: false }))
    isEditing.value = false
    editingIndex.value = null
    draftSentences.value = []
    hasUnsavedChanges.value = false
  }
  function startEditing(index: number) {
    if (editingIndex.value !== null) {
      const cur = draftSentences.value[editingIndex.value]
      if (cur) cur.status = cur.dirty ? 'changed' : 'saved'
    }
    editingIndex.value = index
    draftSentences.value[index].status = 'editing'
  }
  function finishEditing() {
    if (editingIndex.value === null) return
    const s = draftSentences.value[editingIndex.value]
    if (s) s.status = s.dirty ? 'changed' : 'saved'
    editingIndex.value = null
  }
  function updateDraft(index: number, value: string) {
    const s = draftSentences.value[index]
    if (!s) return
    s.en = value
    s.dirty = true
    s.issues = s.issues.filter(i => i !== '已拆分，建议检查中文')
    hasUnsavedChanges.value = true
    s.status = 'editing'
  }

  return { sentences, isEditing, editingIndex, draftSentences, hasUnsavedChanges,
           sentenceIdCounter, displaySentences, cloneSentence, enterEditMode,
           cancelEdits, saveEdits, startEditing, finishEditing, updateDraft }
})
```

- [ ] **Step 4: 创建 useRecordingStore.ts**

```ts
// src/stores/useRecordingStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useRecordingStore = defineStore('recording', () => {
  const isRecording = ref(false)
  const userAudioUrl = ref<string | null>(null)

  function toggleRecording() { isRecording.value = !isRecording.value }
  function playComparison() { /* 静态原型：无实际逻辑 */ }

  return { isRecording, userAudioUrl, toggleRecording, playComparison }
})
```

- [ ] **Step 5: 创建 useFilesStore.ts**

```ts
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

  function simulateUpload() { /* 静态原型 */ }

  return { files, simulateUpload }
})
```

- [ ] **Step 6: 创建 useSettingsStore.ts**

```ts
// src/stores/useSettingsStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Language { code: string; label: string }

export const useSettingsStore = defineStore('settings', () => {
  const languages = ref<Language[]>([
    { code: 'zh-CN', label: '简体中文 (Chinese)' },
    { code: 'en-US', label: 'English (US)' },
    { code: 'ja-JP', label: '日本語 (Japanese)' },
    { code: 'es-ES', label: 'Español (Spanish)' },
  ])
  const selectedLanguage = ref('zh-CN')
  const audioInputDevices = ref<MediaDeviceInfo[]>([])
  const audioOutputDevices = ref<MediaDeviceInfo[]>([])
  const selectedInputId = ref('')
  const selectedOutputId = ref('')

  function setLanguage(code: string) { selectedLanguage.value = code }
  function setInputDevice(id: string) { selectedInputId.value = id }
  function setOutputDevice(id: string) { selectedOutputId.value = id }

  return { languages, selectedLanguage, audioInputDevices, audioOutputDevices,
           selectedInputId, selectedOutputId, setLanguage, setInputDevice, setOutputDevice }
})
```

- [ ] **Step 7: 提交**

```bash
git add src/stores/ && git commit -m "feat(stores): add 6 Pinia store shells with state and actions"
```

---

### Task 3: 创建 18 个 Vue 组件空壳

**Files:**
- Create: `src/components/layout/TitleBar.vue`
- Create: `src/components/layout/AppSidebar.vue`
- Create: `src/components/layout/SubtitleToast.vue`
- Create: `src/components/listening/ListeningView.vue`
- Create: `src/components/listening/PlayerCard.vue`
- Create: `src/components/listening/WaveformDisplay.vue`
- Create: `src/components/listening/PlaybackControls.vue`
- Create: `src/components/listening/SubtitleToolbar.vue`
- Create: `src/components/listening/SubtitleList.vue`
- Create: `src/components/listening/SubtitleCard.vue`
- Create: `src/components/listening/SentenceEditor.vue`
- Create: `src/components/shadowing/ShadowingView.vue`
- Create: `src/components/shadowing/ShadowingWorkArea.vue`
- Create: `src/components/shadowing/WaveformComparison.vue`
- Create: `src/components/shadowing/OriginalWaveform.vue`
- Create: `src/components/shadowing/UserWaveform.vue`
- Create: `src/components/shadowing/RecordingFAB.vue`
- Create: `src/components/shadowing/ShadowingScriptFlow.vue`
- Create: `src/components/shadowing/ScriptFlowItem.vue`
- Create: `src/views/SettingsView.vue`

- [ ] **Step 1: 创建所有 20 个空壳组件（每个文件一行 `<script setup><template><div/></template></script>`）**

```bash
for f in \
  src/components/layout/TitleBar.vue \
  src/components/layout/AppSidebar.vue \
  src/components/layout/SubtitleToast.vue \
  src/components/listening/ListeningView.vue \
  src/components/listening/PlayerCard.vue \
  src/components/listening/WaveformDisplay.vue \
  src/components/listening/PlaybackControls.vue \
  src/components/listening/SubtitleToolbar.vue \
  src/components/listening/SubtitleList.vue \
  src/components/listening/SubtitleCard.vue \
  src/components/listening/SentenceEditor.vue \
  src/components/shadowing/ShadowingView.vue \
  src/components/shadowing/ShadowingWorkArea.vue \
  src/components/shadowing/WaveformComparison.vue \
  src/components/shadowing/OriginalWaveform.vue \
  src/components/shadowing/UserWaveform.vue \
  src/components/shadowing/RecordingFAB.vue \
  src/components/shadowing/ShadowingScriptFlow.vue \
  src/components/shadowing/ScriptFlowItem.vue \
  src/views/SettingsView.vue; do
  echo '<script setup lang="ts">
</script>

<template>
  <div />
</template>
' > "$f"
done
```

- [ ] **Step 2: 提交**

```bash
git add src/components/ src/views/ && git commit -m "feat(ui): add 20 component shells"
```

---

## 阶段二：逐组件填充模板和样式

### Task 4: 布局组件

**Files:**
- Modify: `src/main.ts`
- Modify: `src/App.vue`
- Modify: `src/components/layout/TitleBar.vue`
- Modify: `src/components/layout/AppSidebar.vue`
- Modify: `src/components/layout/SubtitleToast.vue`

- [ ] **Step 1: 修改 main.ts，挂载 Pinia 并导入全局样式**

```ts
// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/ui-shared.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```

- [ ] **Step 2: 修改 App.vue，重写为布局根组件**

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { useAppStore } from './stores/useAppStore'
import TitleBar from './components/layout/TitleBar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import SubtitleToast from './components/layout/SubtitleToast.vue'
import ListeningView from './components/listening/ListeningView.vue'
import ShadowingView from './components/shadowing/ShadowingView.vue'
import SettingsView from './views/SettingsView.vue'

const app = useAppStore()
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col select-none"
       :class="app.theme === 'dark' ? 'text-dark-text' : 'text-light-text'">
    <TitleBar />
    <div class="flex-1 flex overflow-hidden relative w-full">
      <AppSidebar />
      <main class="flex-1 flex overflow-hidden relative transition-colors duration-300"
            :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-light-bg'">
        <ListeningView v-if="app.mode === 'listening'" />
        <ShadowingView v-if="app.mode === 'shadowing'" />
        <SettingsView v-if="app.mode === 'settings'" />
      </main>
    </div>
    <SubtitleToast />
  </div>
</template>
```

- [ ] **Step 3: 填充 TitleBar.vue（来自 ui/index.html 第 124-143 行）**

```vue
<!-- src/components/layout/TitleBar.vue -->
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
```

- [ ] **Step 4: 填充 AppSidebar.vue（来自 ui/index.html 第 148-182 行）**

```vue
<!-- src/components/layout/AppSidebar.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { useFilesStore } from '../../stores/useFilesStore'
import { usePlayerStore } from '../../stores/usePlayerStore'

const app = useAppStore()
const files = useFilesStore()
const player = usePlayerStore()
</script>

<template>
  <div x-show="app.showSidebar && app.mode !== 'settings'"
       class="w-64 border-r flex flex-col flex-shrink-0 z-20 transition-all duration-300"
       :class="{
         'w-0 opacity-0 overflow-hidden': !app.showSidebar || app.mode === 'settings',
         'bg-dark-bg border-gray-800/50': app.theme === 'dark',
         'bg-gray-50 border-gray-200': app.theme !== 'dark'
       }">
    <div class="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 transition-colors duration-300"
         :class="app.theme === 'dark' ? 'border-gray-800/50' : 'border-gray-200'">
      <h2 class="font-bold text-xs tracking-wider" :class="app.theme === 'dark' ? 'text-gray-400' : 'text-slate-500'">资料库</h2>
      <button @click="files.simulateUpload()" class="w-6 h-6 rounded flex items-center justify-center transition-colors"
              :class="app.theme === 'dark' ? 'hover:bg-white/10 text-gray-500 hover:text-gray-300' : 'hover:bg-slate-200 text-slate-400'">
        <i class="fa-solid fa-plus text-xs"></i>
      </button>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
      <div v-for="file in files.files" :key="file.id"
           @click="app.currentTitle = file.title"
           class="p-3 rounded-lg border cursor-pointer transition-all group relative"
           :class="app.currentTitle === file.title ?
              (app.theme === 'dark' ? 'bg-white/5 border-brand-500/30 shadow-sm' : 'bg-white border-brand-300 shadow-sm') :
              (app.theme === 'dark' ? 'border-transparent hover:bg-white/5' : 'hover:bg-white hover:shadow-sm border-transparent')">
        <h3 class="text-xs font-bold leading-snug mb-1"
            :class="app.currentTitle === file.title ? (app.theme === 'dark' ? 'text-brand-400' : 'text-brand-700') : (app.theme === 'dark' ? 'text-gray-300' : 'text-slate-700')">
          {{ file.title }}
        </h3>
        <div class="flex justify-between text-[10px]" :class="app.theme === 'dark' ? 'text-gray-500' : 'text-slate-400'">
          <span>{{ file.date }}</span>
          <span>{{ file.duration }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 填充 SubtitleToast.vue（来自 ui/index.html 第 627-635 行）**

```vue
<!-- src/components/layout/SubtitleToast.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
const app = useAppStore()
</script>

<template>
  <div x-show="app.toast" x-transition.opacity.duration.200ms
       class="absolute bottom-6 right-6 px-4 py-3 rounded-2xl border shadow-xl text-sm z-40"
       :class="app.theme === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-slate-700'">
    <div class="flex items-center gap-3">
      <i class="fa-solid fa-check text-emerald-500"></i>
      <span>{{ app.toast }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 6: 提交**

```bash
git add src/main.ts src/App.vue src/components/layout/ && git commit -m "feat(ui): fill layout components (TitleBar, AppSidebar, SubtitleToast)"
```

---

### Task 5: ListeningView 及子组件

**Files:**
- Modify: `src/components/listening/ListeningView.vue`
- Modify: `src/components/listening/PlayerCard.vue`
- Modify: `src/components/listening/WaveformDisplay.vue`
- Modify: `src/components/listening/PlaybackControls.vue`
- Modify: `src/components/listening/SubtitleToolbar.vue`
- Modify: `src/components/listening/SubtitleList.vue`
- Modify: `src/components/listening/SubtitleCard.vue`
- Modify: `src/components/listening/SentenceEditor.vue`

- [ ] **Step 1: 填充 ListeningView.vue（来自 ui/index.html 第 211-453 行，去掉 Settings 页面部分）**

```vue
<!-- src/components/listening/ListeningView.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import PlayerCard from './PlayerCard.vue'
import SubtitleToolbar from './SubtitleToolbar.vue'
import SubtitleList from './SubtitleList.vue'

const app = useAppStore()
const player = usePlayerStore()
</script>

<template>
  <div class="flex-1 flex flex-col h-full w-full relative transition-colors duration-500"
       :class="app.theme === 'dark' ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'">
    <!-- Player Header -->
    <header class="h-16 flex items-center justify-between px-8 flex-shrink-0 z-10">
      <div class="flex items-center gap-4 ml-8">
        <button @click="app.toggleSidebar()"
                class="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                :class="app.theme === 'dark' ? 'bg-dark-card hover:bg-dark-hover text-white' : 'bg-light-card hover:bg-light-hover text-black'">
          <i :class="app.showSidebar ? 'fa-solid fa-outdent' : 'fa-solid fa-indent'" class="text-sm"></i>
        </button>
        <h2 class="font-semibold text-lg tracking-tight" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">
          {{ app.currentTitle }}
        </h2>
      </div>
    </header>

    <!-- Listening Mode Content -->
    <div class="flex-1 flex flex-col items-center overflow-hidden animate-fade-in pt-4 pb-10 px-8">
      <PlayerCard />
      <SubtitleToolbar />
      <SubtitleList />

      <!-- Bottom CTA -->
      <div class="w-full max-w-3xl mt-4 flex-shrink-0 z-20">
        <button @click="app.switchMode('shadowing')"
                class="w-full font-medium py-4 rounded border border-transparent transition-all hover:translate-y-[-1px] flex items-center justify-center gap-2 group tracking-wide"
                :class="app.theme === 'dark' ? 'bg-zinc-100 hover:bg-white text-black' : 'bg-black hover:bg-gray-800 text-white'">
          Start Speaking Practice
          <i class="fa-solid fa-microphone transition-colors" :class="app.theme === 'dark' ? 'group-hover:text-red-500' : 'group-hover:text-red-400'"></i>
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 填充 PlayerCard.vue（来自 ui/index.html 第 214-294 行）**

```vue
<!-- src/components/listening/PlayerCard.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import WaveformDisplay from './WaveformDisplay.vue'
import PlaybackControls from './PlaybackControls.vue'

const app = useAppStore()
</script>

<template>
  <div class="w-full max-w-3xl rounded-2xl p-6 border shadow-2xl flex flex-col gap-6 flex-shrink-0 z-10 transition-colors duration-300"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-bold uppercase tracking-wide"
          :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">Intensive Listening</h3>
      <button class="transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-black'">
        <i class="fa-solid fa-ellipsis"></i>
      </button>
    </div>
    <WaveformDisplay />
    <PlaybackControls />
  </div>
</template>
```

- [ ] **Step 3: 填充 WaveformDisplay.vue（来自 ui/index.html 第 226-241 行）**

```vue
<!-- src/components/listening/WaveformDisplay.vue -->
<script setup lang="ts">
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useAppStore } from '../../stores/useAppStore'
import { computed } from 'vue'

const player = usePlayerStore()
const app = useAppStore()

// 生成静态波形数据（120 根柱子）
const bars = Array.from({ length: 120 }, (_, i) => ({
  height: Math.random() * 80 + 20,
  isActive: i < 45,
}))

const progressPercent = computed(() => `${(45 / 120) * 100}%`)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="h-16 flex items-center gap-[2px] overflow-hidden relative">
      <div v-for="(bar, i) in bars" :key="i"
           class="w-1 rounded-full transition-all duration-150"
           :class="bar.isActive
              ? (app.theme === 'dark' ? 'bg-brand-500' : 'bg-black')
              : (app.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300')"
           :style="`height: ${bar.height}%`">
      </div>
      <!-- Progress indicator -->
      <div class="absolute left-[37%] top-0 bottom-0 w-0.5 flex flex-col items-center justify-center"
           :class="app.theme === 'dark' ? 'bg-white' : 'bg-black'">
        <div class="w-3 h-3 rounded-full border-2 shadow-lg"
             :class="app.theme === 'dark' ? 'bg-brand-500 border-white' : 'bg-black border-white'"></div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 填充 PlaybackControls.vue（来自 ui/index.html 第 244-292 行）**

```vue
<!-- src/components/listening/PlaybackControls.vue -->
<script setup lang="ts">
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'

const player = usePlayerStore()
const app = useAppStore()
const transcript = useTranscriptStore()
</script>

<template>
  <div class="grid grid-cols-3 items-center">
    <!-- Left: Rewind -->
    <div class="justify-self-start">
      <button class="text-sm transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-black'">
        <i class="fa-solid fa-rotate-left mr-1"></i> 5s
      </button>
    </div>

    <!-- Center: Controls -->
    <div class="flex items-center gap-6 justify-self-center">
      <button @click="player.prevSentence()" class="text-lg transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black'">
        <i class="fa-solid fa-backward-step"></i>
      </button>
      <button @click="player.togglePlay()"
              class="w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all"
              :class="app.theme === 'dark' ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-brand-500/20' : 'bg-black hover:bg-gray-800 text-white shadow-black/20'">
        <i :class="player.isPlaying ? 'fa-pause' : 'fa-play'" class="fa-solid text-lg"></i>
      </button>
      <button @click="player.nextSentence()" class="text-lg transition-colors"
              :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black'">
        <i class="fa-solid fa-forward-step"></i>
      </button>
      <button @click="player.toggleLoop()" class="text-lg transition-colors relative"
              :class="player.isLooping ? 'text-brand-500' : (app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black')"
              title="Repeat Current">
        <i class="fa-solid fa-repeat"></i>
        <div v-if="player.isLooping" class="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500"></div>
      </button>
    </div>

    <!-- Right: Volume + Time -->
    <div class="flex items-center gap-4 text-xs font-mono text-gray-500 justify-self-end">
      <div class="flex items-center gap-2 group mr-2">
        <button @click="player.toggleMute()" class="w-5 focus:outline-none text-right" title="Mute/Unmute">
          <i class="fa-solid transition-colors text-sm"
             :class="player.volume == 0 ? 'fa-volume-xmark' : (player.volume < 50 ? 'fa-volume-low' : 'fa-volume-high')"
             :class="app.theme === 'dark' ? 'text-gray-400 group-hover:text-white' : 'text-gray-400 group-hover:text-black'"></i>
        </button>
        <input type="range" min="0" max="100" v-model.number="player.volume" class="w-16 cursor-pointer">
      </div>
      <span>00:36 / 01:30</span>
      <span class="cursor-pointer transition-colors"
            :class="app.theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-black'">1x</span>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 填充 SubtitleToolbar.vue（来自 ui/index.html 第 296-327 行）**

```vue
<!-- src/components/listening/SubtitleToolbar.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
</script>

<template>
  <div class="w-full max-w-3xl flex items-center justify-between py-2 gap-2">
    <div class="flex items-center gap-2">
      <button @click="transcript.isEditing ? transcript.cancelEdits() : transcript.enterEditMode()"
              class="transition-colors text-[11px] font-bold border px-2.5 py-1 rounded-md flex items-center gap-1.5"
              :class="transcript.isEditing
                 ? (app.theme === 'dark' ? 'bg-white text-black border-white' : 'bg-black text-white border-black')
                 : (app.theme === 'dark' ? 'text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white' : 'text-slate-600 border-gray-300 hover:border-gray-400 hover:text-black')">
        <i class="fa-solid" :class="transcript.isEditing ? 'fa-xmark' : 'fa-pen-to-square'"></i>
        <span>{{ transcript.isEditing ? '退出编辑' : '编辑字幕' }}</span>
      </button>
    </div>

    <div class="flex items-center gap-2">
      <button v-if="transcript.isEditing" @click="transcript.saveEdits()"
              class="transition-colors text-[11px] font-bold border px-2.5 py-1 rounded-md flex items-center gap-1.5"
              :class="transcript.hasUnsavedChanges
                 ? (app.theme === 'dark' ? 'bg-white text-black border-white' : 'bg-black text-white border-black')
                 : (app.theme === 'dark' ? 'text-gray-600 border-gray-800 cursor-not-allowed' : 'text-gray-300 border-gray-200 cursor-not-allowed')"
              :disabled="!transcript.hasUnsavedChanges">
        <i class="fa-solid fa-check"></i> 保存
      </button>
      <button v-if="transcript.isEditing" @click="transcript.cancelEdits(); app.showSubtitleToast('已放弃未保存的字幕修改')"
              class="transition-colors text-[11px] font-bold border px-2.5 py-1 rounded-md"
              :class="app.theme === 'dark' ? 'text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white' : 'text-slate-500 border-gray-300 hover:border-gray-400 hover:text-black'">
        取消
      </button>

      <button @click="player.toggleEn()" class="transition-colors text-[11px] font-bold border px-2 py-1 rounded-md"
              :class="player.showEn
                 ? (app.theme === 'dark' ? 'bg-white text-black border-white' : 'bg-black text-white border-black')
                 : (app.theme === 'dark' ? 'text-gray-500 border-gray-700 hover:border-gray-500' : 'text-gray-400 border-gray-300 hover:border-gray-400')">
        EN
      </button>
      <button @click="player.toggleZh()" class="transition-colors text-[11px] font-bold border px-2 py-1 rounded-md"
              :class="player.showZh
                 ? (app.theme === 'dark' ? 'bg-white text-black border-white' : 'bg-black text-white border-black')
                 : (app.theme === 'dark' ? 'text-gray-500 border-gray-700 hover:border-gray-500' : 'text-gray-400 border-gray-300 hover:border-gray-400')">
        中
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 6: 填充 SentenceEditor.vue（来自 ui/index.html 第 401-422 行）**

```vue
<!-- src/components/listening/SentenceEditor.vue -->
<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'

const props = defineProps<{ index: number; sentenceId: number }>()
const app = useAppStore()
const transcript = useTranscriptStore()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

onMounted(() => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      const len = textareaRef.value.value.length
      textareaRef.value.setSelectionRange(len, len)
    }
  })
})
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-start">
      <textarea
        ref="textareaRef"
        rows="2"
        class="w-full text-base leading-6 rounded-xl border px-3 py-2 outline-none resize-none transition-colors"
        :class="app.theme === 'dark' ? 'bg-zinc-950 border-zinc-700 text-white focus:border-zinc-500' : 'bg-white border-gray-300 text-black focus:border-gray-500'"
        :value="transcript.draftSentences[index]?.en"
        @input="transcript.updateDraft(index, ($event.target as HTMLTextAreaElement).value)"
        @keydown.enter.exact.prevent="$emit('split', index)"
        @keydown.meta.enter.prevent="transcript.finishEditing()"
        @keydown.ctrl.enter.prevent="transcript.finishEditing()"
        @keydown.escape.prevent="transcript.finishEditing()"
      />
    </div>
    <div class="text-[10px] tracking-[0.12em] uppercase"
         :class="app.theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'">
      回车按光标断句，Cmd/Ctrl + Enter 完成当前行
    </div>
  </div>
</template>
```

- [ ] **Step 7: 填充 SubtitleCard.vue（来自 ui/index.html 第 332-439 行）**

```vue
<!-- src/components/listening/SubtitleCard.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'
import SentenceEditor from './SentenceEditor.vue'

const props = defineProps<{ item: Sentence; index: number }>()
const emit = defineEmits<{ split: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()

const isActive = computed(() => props.index === player.currentIndex)
const isEditing = computed(() => transcript.isEditing && transcript.editingIndex === props.index)
const isTotalLast = computed(() => transcript.displaySentences.length === 1)

function getSentenceBadge(s: Sentence) {
  if (s.status === 'new') return 'new'
  if (s.status === 'changed' || s.status === 'editing') return 'changed'
  return ''
}

const cardClass = computed(() => {
  if (isEditing.value) {
    return app.theme === 'dark'
      ? 'bg-zinc-900/90 border-zinc-500 shadow-2xl'
      : 'bg-white border-slate-400 shadow-xl'
  }
  if (isActive.value) {
    return app.theme === 'dark'
      ? 'bg-dark-highlight border-brand-500/30 shadow-lg transform scale-[1.02]'
      : 'bg-light-highlight border-gray-300 shadow-lg transform scale-[1.02]'
  }
  return app.theme === 'dark'
    ? 'cursor-pointer hover:bg-dark-card/50 opacity-70 hover:opacity-100'
    : 'cursor-pointer hover:bg-light-card/50 opacity-70 hover:opacity-100'
})
</script>

<template>
  <div @click="isEditing ? transcript.startEditing(index) : player.setCurrentIndex(index)"
       class="px-3 py-2.5 rounded-lg transition-all duration-300 border border-transparent group"
       :class="cardClass">

    <!-- 编辑工具栏（isEditing + 当前行时显示） -->
    <div v-if="isEditing" class="flex items-start justify-between gap-2 mb-2">
      <div class="flex items-center gap-1.5 pt-0.5 flex-shrink-0">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em]"
              :class="app.theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <span v-if="getSentenceBadge(item)"
              class="px-1.5 py-0.5 rounded-full border text-[9px] font-bold tracking-[0.14em]"
              :class="item.status === 'new'
                 ? (app.theme === 'dark' ? 'border-emerald-900/60 text-emerald-300 bg-emerald-950/30' : 'border-emerald-200 text-emerald-700 bg-emerald-50')
                 : (app.theme === 'dark' ? 'border-sky-900/60 text-sky-300 bg-sky-950/30' : 'border-sky-200 text-sky-700 bg-sky-50')">
              {{ getSentenceBadge(item) }}
        </span>
      </div>
      <div class="flex items-center gap-1 flex-wrap justify-end">
        <button @click.stop="transcript.startEditing(index)"
                class="w-7 h-7 rounded-md border text-[11px] transition-colors"
                :class="app.theme === 'dark' ? 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500' : 'border-gray-300 text-slate-500 hover:text-black hover:border-gray-400'"
                title="编辑">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button @click.stop="emit('split', index)"
                class="px-2 h-7 rounded-md border text-[10px] font-bold transition-colors"
                :class="app.theme === 'dark' ? 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white' : 'border-gray-300 text-slate-600 hover:border-gray-400 hover:text-black'"
                title="拆句">拆</button>
        <button @click.stop="transcript.cancelEdits()"
                class="px-2 h-7 rounded-md border text-[10px] font-bold transition-colors"
                :class="index === 0
                   ? (app.theme === 'dark' ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed')
                   : (app.theme === 'dark' ? 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white' : 'border-gray-300 text-slate-600 hover:border-gray-400 hover:text-black')"
                :disabled="index === 0" title="与上一句合并">前并</button>
        <button @click.stop="transcript.cancelEdits()"
                class="px-2 h-7 rounded-md border text-[10px] font-bold transition-colors"
                :class="index === transcript.displaySentences.length - 1
                   ? (app.theme === 'dark' ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed')
                   : (app.theme === 'dark' ? 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white' : 'border-gray-300 text-slate-600 hover:border-gray-400 hover:text-black')"
                :disabled="index === transcript.displaySentences.length - 1" title="与下一句合并">后并</button>
        <button @click.stop="transcript.cancelEdits()"
                class="w-7 h-7 rounded-md border text-[11px] transition-colors"
                :class="isTotalLast
                   ? (app.theme === 'dark' ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed')
                   : (app.theme === 'dark' ? 'border-red-900/60 text-red-400 hover:border-red-500 hover:text-red-300' : 'border-red-200 text-red-500 hover:border-red-400 hover:text-red-600')"
                :disabled="isTotalLast" title="删除">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>

    <!-- 句子展示（非编辑时） -->
    <div v-if="!isEditing" class="flex items-start gap-2.5">
      <div class="flex items-center gap-1.5 pt-0.5 flex-shrink-0">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em]"
              :class="app.theme === 'dark' ? 'text-zinc-500' : 'text-slate-400'">
          {{ String(index + 1).padStart(2, '0') }}
        </span>
        <span v-if="getSentenceBadge(item)"
              class="px-1.5 py-0.5 rounded-full border text-[9px] font-bold tracking-[0.14em]"
              :class="item.status === 'new'
                 ? (app.theme === 'dark' ? 'border-emerald-900/60 text-emerald-300 bg-emerald-950/30' : 'border-emerald-200 text-emerald-700 bg-emerald-50')
                 : (app.theme === 'dark' ? 'border-sky-900/60 text-sky-300 bg-sky-950/30' : 'border-sky-200 text-sky-700 bg-sky-50')">
              {{ getSentenceBadge(item) }}
        </span>
      </div>
      <p class="text-base font-medium leading-6 transition-all duration-300 flex-1"
         :class="[
           isActive ? (app.theme === 'dark' ? 'text-brand-100' : 'text-black') : (app.theme === 'dark' ? 'text-gray-300' : 'text-gray-600'),
           player.showEn ? '' : 'blur-md opacity-50 select-none'
         ]">
        {{ item.en }}
      </p>
    </div>

    <!-- 编辑器（编辑模式下显示） -->
    <SentenceEditor v-if="isEditing" :index="index" :sentence-id="item.id" @split="emit('split', index)" />

    <!-- Issues 标签 -->
    <div v-if="item.issues?.length" class="mt-2 flex flex-wrap gap-1.5">
      <span v-for="issue in item.issues" :key="issue"
            class="text-[10px] px-2 py-0.5 rounded-full border"
            :class="app.theme === 'dark' ? 'border-amber-900/60 text-amber-300 bg-amber-950/30' : 'border-amber-200 text-amber-700 bg-amber-50'">
        {{ issue }}
      </span>
    </div>

    <!-- 中文翻译 -->
    <div class="overflow-hidden transition-all duration-300"
         :class="player.showZh ? 'max-h-20 mt-2 opacity-100' : 'max-h-0 opacity-0'">
      <p class="text-xs leading-5" :class="app.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'">
        {{ item.zh || '待补充中文翻译' }}
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 8: 填充 SubtitleList.vue（来自 ui/index.html 第 329-442 行）**

```vue
<!-- src/components/listening/SubtitleList.vue -->
<script setup lang="ts">
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import SubtitleCard from './SubtitleCard.vue'

const transcript = useTranscriptStore()
</script>

<template>
  <div class="flex-1 w-full max-w-3xl overflow-y-auto no-scrollbar relative" id="subtitle-container">
    <div class="space-y-1.5 pb-20">
      <SubtitleCard
        v-for="(item, index) in transcript.displaySentences"
        :key="item.id"
        :item="item"
        :index="index"
        @split="(idx) => transcript.updateDraft(idx, transcript.draftSentences[idx]?.en || '')"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 9: 提交**

```bash
git add src/components/listening/ && git commit -m "feat(ui): fill listening components (ListeningView, PlayerCard, WaveformDisplay, PlaybackControls, SubtitleToolbar, SubtitleList, SubtitleCard, SentenceEditor)"
```

---

### Task 6: ShadowingView 及子组件

**Files:**
- Modify: `src/components/shadowing/ShadowingView.vue`
- Modify: `src/components/shadowing/ShadowingWorkArea.vue`
- Modify: `src/components/shadowing/WaveformComparison.vue`
- Modify: `src/components/shadowing/OriginalWaveform.vue`
- Modify: `src/components/shadowing/UserWaveform.vue`
- Modify: `src/components/shadowing/RecordingFAB.vue`
- Modify: `src/components/shadowing/ShadowingScriptFlow.vue`
- Modify: `src/components/shadowing/ScriptFlowItem.vue`

- [ ] **Step 1: 填充 ShadowingView.vue（来自 ui/index.html 第 455-624 行主容器）**

```vue
<!-- src/components/shadowing/ShadowingView.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import ShadowingWorkArea from './ShadowingWorkArea.vue'
import ShadowingScriptFlow from './ShadowingScriptFlow.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()
</script>

<template>
  <div class="flex-1 flex flex-row overflow-hidden"
       :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-light-bg'">
    <ShadowingWorkArea />
    <ShadowingScriptFlow />
  </div>
</template>
```

- [ ] **Step 2: 填充 ShadowingWorkArea.vue（来自 ui/index.html 第 459-500 行）**

```vue
<!-- src/components/shadowing/ShadowingWorkArea.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import WaveformComparison from './WaveformComparison.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
</script>

<template>
  <div class="flex-1 flex flex-col p-6 gap-6 animate-fade-in overflow-y-auto">
    <!-- Top hint -->
    <div class="flex justify-between items-end px-2">
      <div>
        <button @click="app.switchMode('listening')"
                class="text-sm mb-2 flex items-center gap-1 transition-colors"
                :class="app.theme === 'dark' ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-black'">
          <i class="fa-solid fa-arrow-left"></i> Back to Listening
        </button>
        <h3 class="text-lg font-bold" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Shadowing Challenge</h3>
      </div>
    </div>

    <!-- Main Card -->
    <div class="flex-1 rounded-2xl border shadow-sm flex flex-col overflow-hidden transition-colors"
         :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
      <!-- Text Reference -->
      <div class="p-8 border-b z-10 transition-colors flex items-center justify-between gap-4"
           :class="app.theme === 'dark' ? 'border-dark-border bg-dark-card' : 'border-light-border bg-light-card'">
        <button @click="player.prevSentence()"
                class="p-2 rounded-full transition-colors flex-shrink-0"
                :class="app.theme === 'dark' ? 'hover:bg-white/10 text-gray-500 hover:text-white' : 'hover:bg-black/5 text-gray-400 hover:text-black'"
                :disabled="player.currentIndex === 0"
                :style="player.currentIndex === 0 ? 'opacity: 0.3; cursor: not-allowed;' : ''">
          <i class="fa-solid fa-chevron-left text-lg"></i>
        </button>

        <div class="text-center flex-1">
          <p class="text-2xl font-medium" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">
            {{ transcript.sentences[player.currentIndex]?.en }}
          </p>
          <p class="mt-4" :class="app.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'">
            {{ transcript.sentences[player.currentIndex]?.zh }}
          </p>
        </div>

        <button @click="player.nextSentence()"
                class="p-2 rounded-full transition-colors flex-shrink-0"
                :class="app.theme === 'dark' ? 'hover:bg-white/10 text-gray-500 hover:text-white' : 'hover:bg-black/5 text-gray-400 hover:text-black'"
                :disabled="player.currentIndex === transcript.sentences.length - 1"
                :style="player.currentIndex === transcript.sentences.length - 1 ? 'opacity: 0.3; cursor: not-allowed;' : ''">
          <i class="fa-solid fa-chevron-right text-lg"></i>
        </button>
      </div>

      <!-- Waveform Comparison -->
      <WaveformComparison />
    </div>
  </div>
</template>
```

- [ ] **Step 3: 填充 WaveformComparison.vue（来自 ui/index.html 第 503-578 行）**

```vue
<!-- src/components/shadowing/WaveformComparison.vue -->
<script setup lang="ts">
import OriginalWaveform from './OriginalWaveform.vue'
import UserWaveform from './UserWaveform.vue'
import RecordingFAB from './RecordingFAB.vue'
</script>

<template>
  <div class="flex-1 flex flex-col relative">
    <OriginalWaveform />
    <UserWaveform />
    <RecordingFAB />
  </div>
</template>
```

- [ ] **Step 4: 填充 OriginalWaveform.vue（来自 ui/index.html 第 505-532 行）**

```vue
<!-- src/components/shadowing/OriginalWaveform.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'

const app = useAppStore()
const player = usePlayerStore()

const bars = Array.from({ length: 100 }, () => Math.random() * 60 + 20)
</script>

<template>
  <div class="flex-1 relative border-b flex flex-col justify-center group transition-colors"
       :class="app.theme === 'dark' ? 'bg-dark-bg/50 border-dark-border' : 'bg-white border-light-border'">
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors"
            :class="app.theme === 'dark' ? 'bg-brand-900/50 text-brand-400 border border-brand-900' : 'bg-gray-100 text-gray-500 border border-gray-200'">Original</span>
    </div>

    <div class="absolute top-4 right-4 z-10 flex items-center gap-2">
      <button @click="player.toggleMute()" class="w-5 focus:outline-none text-right" title="Mute/Unmute">
        <i class="fa-solid transition-colors text-sm"
           :class="player.volume == 0 ? 'fa-volume-xmark' : (player.volume < 50 ? 'fa-volume-low' : 'fa-volume-high')"
           :class="app.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'"></i>
      </button>
    </div>

    <div class="w-full px-10 h-24 flex items-center justify-center gap-1">
      <div v-for="(h, i) in bars" :key="i"
           class="w-1.5 rounded-full transition-all"
           :class="player.isPlaying ? 'animate-wave ' : '' + (app.theme === 'dark' ? 'bg-brand-500/40' : 'bg-black/20')"
           :style="`height: ${h}%`"></div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 填充 UserWaveform.vue（来自 ui/index.html 第 534-563 行）**

```vue
<!-- src/components/shadowing/UserWaveform.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { useRecordingStore } from '../../stores/useRecordingStore'

const app = useAppStore()
const recording = useRecordingStore()

const animBars = Array.from({ length: 100 }, () => Math.random() * 80 + 10)
</script>

<template>
  <div class="flex-1 relative flex flex-col justify-center group border-t transition-colors"
       :class="app.theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-gray-50 border-gray-200'">
    <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-colors"
            :class="app.theme === 'dark' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-white text-gray-500 border border-gray-200'">You</span>
    </div>

    <div class="absolute top-4 right-4 z-10 flex items-center gap-2"
         x-show="recording.userAudioUrl && !recording.isRecording" x-transition>
      <button @click="recording.playComparison()"
              class="px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-2 group"
              :class="app.theme === 'dark' ? 'bg-zinc-200 hover:bg-white text-black border-zinc-200' : 'bg-black hover:bg-gray-800 text-white border-black'"
              title="快捷键: C">
        <i class="fa-solid fa-code-compare"></i> Contrast
      </button>
    </div>

    <div class="w-full px-10 h-24 flex items-center justify-center gap-1">
      <template v-if="recording.isRecording">
        <div v-for="(_, i) in animBars" :key="i"
             class="w-1 bg-red-500 rounded-full animate-wave"
             :style="`height: ${animBars[i]}%; animation-delay: ${i * 0.05}s`"></div>
      </template>
      <template v-else>
        <div class="text-sm font-light tracking-wide"
             :class="app.theme === 'dark' ? 'text-zinc-600' : 'text-gray-400'">Tap microphone to record</div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 6: 填充 RecordingFAB.vue（来自 ui/index.html 第 565-577 行）**

```vue
<!-- src/components/shadowing/RecordingFAB.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { useRecordingStore } from '../../stores/useRecordingStore'

const app = useAppStore()
const recording = useRecordingStore()
</script>

<template>
  <div class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center group">
    <button @click="recording.toggleRecording()"
            class="w-20 h-20 rounded-full flex items-center justify-center text-2xl transition-all relative border z-10"
            :class="(recording.isRecording ? 'recording-ring ' : '') +
               (app.theme === 'dark'
                 ? (recording.isRecording ? 'bg-black text-red-500 border-zinc-700' : 'bg-black text-zinc-400 hover:text-white border-zinc-700 hover:border-zinc-500')
                 : (recording.isRecording ? 'bg-white text-red-500 border-gray-200' : 'bg-white text-gray-400 hover:text-black border-gray-200 hover:border-gray-400 shadow-lg'))">
      <i :class="recording.isRecording ? 'fa-solid fa-stop' : 'fa-solid fa-microphone'"></i>
    </button>
    <div class="absolute top-full mt-4 px-3 py-1.5 rounded text-xs border opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-y-0 translate-y-[-4px] pointer-events-none whitespace-nowrap z-20"
         :class="app.theme === 'dark' ? 'bg-zinc-900 text-zinc-500 border-zinc-800' : 'bg-white text-gray-500 border-gray-200 shadow-sm'">
      Shortcut <kbd class="font-sans font-bold px-1.5 py-0.5 rounded ml-1 border"
                    :class="app.theme === 'dark' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-gray-100 text-gray-600 border-gray-200'">R</kbd>
    </div>
  </div>
</template>
```

- [ ] **Step 7: 填充 ScriptFlowItem.vue（来自 ui/index.html 第 594-620 行）**

```vue
<!-- src/components/shadowing/ScriptFlowItem.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore, type Sentence } from '../../stores/useTranscriptStore'

const props = defineProps<{ item: Sentence; index: number }>()
const emit = defineEmits<{ click: [index: number] }>()

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()

const isActive = computed(() => props.index === player.currentIndex)
const isDone = computed(() => props.index < player.currentIndex)
</script>

<template>
  <div @click="emit('click', index)"
       class="p-3 rounded-lg border cursor-pointer transition-all group flex gap-3 items-start"
       :class="isActive
          ? (app.theme === 'dark' ? 'bg-brand-900/20 border-brand-500/30' : 'bg-gray-200 border-transparent')
          : (app.theme === 'dark' ? 'border-transparent hover:bg-dark-highlight opacity-50 hover:opacity-100' : 'border-transparent hover:bg-gray-200 opacity-50 hover:opacity-100')">

    <!-- Status Icon -->
    <div class="mt-0.5">
      <template v-if="isDone">
        <i class="fa-solid fa-circle-check text-green-500 text-xs"></i>
      </template>
      <template v-else-if="isActive">
        <div class="w-2 h-2 rounded-full mt-1.5 animate-pulse"
             :class="app.theme === 'dark' ? 'bg-brand-500' : 'bg-black'"></div>
      </template>
      <template v-else>
        <div class="w-2 h-2 rounded-full mt-1.5"
             :class="app.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'"></div>
      </template>
    </div>

    <div>
      <p class="text-sm leading-snug transition-colors"
         :class="isActive
            ? (app.theme === 'dark' ? 'text-white font-medium' : 'text-black font-medium')
            : (app.theme === 'dark' ? 'text-gray-400' : 'text-gray-500')">
        {{ item.en }}
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 8: 填充 ShadowingScriptFlow.vue（来自 ui/index.html 第 582-623 行）**

```vue
<!-- src/components/shadowing/ShadowingScriptFlow.vue -->
<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTranscriptStore } from '../../stores/useTranscriptStore'
import ScriptFlowItem from './ScriptFlowItem.vue'

const app = useAppStore()
const player = usePlayerStore()
const transcript = useTranscriptStore()
</script>

<template>
  <div class="w-80 border-l flex flex-col z-10 transition-colors"
       :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">
    <div class="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 transition-colors"
         :class="app.theme === 'dark' ? 'border-dark-border' : 'border-light-border'">
      <h3 class="text-xs font-bold uppercase tracking-wide"
          :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">Script Flow</h3>
      <span class="text-xs font-mono"
            :class="app.theme === 'dark' ? 'text-brand-400' : 'text-black'">
        {{ player.currentIndex + 1 }}/{{ transcript.sentences.length }}
      </span>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
      <ScriptFlowItem
        v-for="(item, index) in transcript.sentences"
        :key="item.id"
        :item="item"
        :index="index"
        @click="player.setCurrentIndex(index)"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 9: 提交**

```bash
git add src/components/shadowing/ && git commit -m "feat(ui): fill shadowing components (ShadowingView, WaveformComparison, OriginalWaveform, UserWaveform, RecordingFAB, ShadowingScriptFlow, ScriptFlowItem)"
```

---

### Task 7: SettingsView

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: 填充 SettingsView.vue（来自 ui/index.html 第 637-727 行）**

```vue
<!-- src/views/SettingsView.vue -->
<script setup lang="ts">
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'

const app = useAppStore()
const settings = useSettingsStore()
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden items-center justify-center relative transition-colors duration-500"
       :class="app.theme === 'dark' ? 'bg-dark-bg text-dark-text' : 'bg-light-bg text-light-text'">
    <div class="w-full max-w-lg p-8 rounded-2xl border shadow-2xl relative"
         :class="app.theme === 'dark' ? 'bg-dark-card border-dark-border' : 'bg-light-card border-light-border'">

      <!-- Close Button -->
      <button @click="app.closeSettings()"
              class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none">
        <i class="fa-solid fa-xmark text-xl"></i>
      </button>

      <h2 class="text-2xl font-bold mb-6" :class="app.theme === 'dark' ? 'text-white' : 'text-black'">Settings</h2>

      <div class="space-y-6">
        <!-- Interface Language -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Interface Language</label>
          <div class="relative">
            <select v-model="settings.selectedLanguage"
                    class="w-full p-3 rounded-lg border appearance-none focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'">
              <option v-for="lang in settings.languages" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
              <i class="fa-solid fa-globe text-xs"></i>
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">Choose your preferred language for the application interface.</p>
        </div>

        <!-- Input Device -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Microphone (Input)</label>
          <div class="relative">
            <select v-model="settings.selectedInputId"
                    class="w-full p-3 rounded-lg border appearance-none focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'">
              <option v-if="settings.audioInputDevices.length === 0" value="">No microphones found</option>
              <option v-for="device in settings.audioInputDevices" :key="device.deviceId"
                      :value="device.deviceId">
                {{ device.label || `Microphone ${device.deviceId.slice(0,5)}...` }}
              </option>
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
              <i class="fa-solid fa-microphone text-xs"></i>
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">Select the device you want to use for recording your voice.</p>
        </div>

        <!-- Output Device -->
        <div v-if="settings.audioOutputDevices.length > 0">
          <label class="block text-xs font-bold uppercase tracking-wider mb-2"
                 :class="app.theme === 'dark' ? 'text-brand-400' : 'text-gray-500'">Speakers (Output)</label>
          <div class="relative">
            <select v-model="settings.selectedOutputId"
                    class="w-full p-3 rounded-lg border appearance-none focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    :class="app.theme === 'dark' ? 'bg-dark-bg border-gray-700 text-white' : 'bg-white border-gray-300 text-black'">
              <option v-for="device in settings.audioOutputDevices" :key="device.deviceId"
                      :value="device.deviceId">
                {{ device.label || `Speaker ${device.deviceId.slice(0,5)}...` }}
              </option>
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
              <i class="fa-solid fa-volume-high text-xs"></i>
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">Note: Output device selection depends on browser support.</p>
        </div>
      </div>

      <div class="mt-8 pt-6 border-t flex justify-end" :class="app.theme === 'dark' ? 'border-gray-800' : 'border-gray-200'">
        <button @click="app.closeSettings()"
                class="px-6 py-2 rounded-lg font-medium transition-colors"
                :class="app.theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'">
          Done
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add src/views/SettingsView.vue && git commit -m "feat(ui): add SettingsView"
```

---

## 阶段三：构建验证

### Task 8: 构建验证

- [ ] **Step 1: 运行构建验证**

```bash
npm run build
```

预期：`vue-tsc --noEmit` 和 `vite build` 均通过，无 TypeScript 错误。

- [ ] **Step 2: 提交**

```bash
git add -A && git commit -m "chore: verify build passes"
```

---

## 自我审查清单

- [ ] 所有 20 个组件文件均已创建
- [ ] 所有 6 个 Store 文件均已创建并包含完整 state + actions
- [ ] `main.ts` 正确挂载了 Pinia
- [ ] `App.vue` 包含 ListeningView、ShadowingView、SettingsView 的条件渲染
- [ ] `ui-shared.css` 包含所有全局动画和样式
- [ ] `npm run build` 通过，无 TS 错误
- [ ] 无 TODO / TBD 占位符
- [ ] 所有 commit 语义化

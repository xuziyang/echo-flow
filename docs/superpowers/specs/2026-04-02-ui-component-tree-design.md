# EchoFlow UI 原型迁移：Vue 组件树 + Pinia 状态设计

## 目标

将 `ui/index.html`（Alpine.js 静态原型）迁移为可维护的 Vue 3 组件树和 Pinia 状态管理。**不引入业务逻辑**（播放器实现、录音、Tauri 交互），仅完成 UI 结构拆分和状态建模。

---

## 1. 组件树

```
src/
├── App.vue                      # 根组件：布局 + mode 路由
├── main.ts                      # 挂载 Pinia
├── components/
│   ├── layout/
│   │   ├── TitleBar.vue         # 交通灯 + App 名称 + 主题/设置按钮
│   │   ├── AppSidebar.vue       # 文件列表侧边栏
│   │   └── SubtitleToast.vue    # 操作反馈通知
│   ├── listening/
│   │   ├── ListeningView.vue    # 精听模式容器
│   │   ├── PlayerCard.vue      # 播放器卡片
│   │   │   ├── WaveformDisplay.vue   # 波形进度条
│   │   │   └── PlaybackControls.vue # 播放/暂停/循环/音量
│   │   ├── SubtitleToolbar.vue # 编辑按钮 + EN/ZH 切换
│   │   └── SubtitleList.vue    # 句子列表容器
│   │       └── SubtitleCard.vue # 单个句子项
│   │           └── SentenceEditor.vue # 行内 textarea 编辑器
│   └── shadowing/
│       ├── ShadowingView.vue   # 跟读模式容器
│       ├── ShadowingWorkArea.vue
│       │   ├── WaveformComparison.vue # 双轨对比 + FAB
│       │   │   ├── OriginalWaveform.vue
│       │   │   └── UserWaveform.vue
│       │   └── RecordingFAB.vue # 录音按钮（含脉冲动画）
│       └── ShadowingScriptFlow.vue # 右侧脚本进度列表
│           └── ScriptFlowItem.vue
├── views/
│   └── SettingsView.vue        # 设置页面
└── stores/
    ├── useAppStore.ts          # theme、mode、showSidebar、currentTitle、toast
    ├── usePlayerStore.ts       # isPlaying、currentIndex、volume、isLooping
    ├── useTranscriptStore.ts   # sentences、draftSentences、editingIndex、脏标记
    ├── useRecordingStore.ts    # isRecording、userAudioUrl
    ├── useFilesStore.ts        # files 列表
    └── useSettingsStore.ts     # language、设备选择
```

### 组件数量：约 18 个

---

## 2. Store 设计

### useAppStore
```ts
state: {
  mode: 'listening' | 'shadowing' | 'settings'
  lastMode: string
  theme: 'dark' | 'light'
  showSidebar: boolean
  currentTitle: string
  toast: string
  toastTimer: ReturnType<typeof setTimeout> | null
}
actions: toggleTheme, switchMode, openSettings, closeSettings,
         showSubtitleToast, toggleSidebar
```

### usePlayerStore
```ts
state: {
  isPlaying: boolean
  isLooping: boolean
  currentIndex: number
  volume: number
  lastVolume: number
  showEn: boolean
  showZh: boolean
}
actions: togglePlay, toggleLoop, toggleMute, setVolume,
         setCurrentIndex, prevSentence, nextSentence,
         toggleEn, toggleZh
```

### useTranscriptStore
```ts
state: {
  sentences: Sentence[]         # 主数据
  isEditing: boolean            # 是否在编辑模式
  editingIndex: number | null   # 当前正在编辑的行
  draftSentences: Sentence[]    # 编辑草稿副本
  hasUnsavedChanges: boolean
  sentenceIdCounter: number
}
actions: enterEditMode, startEditing, finishEditing,
         cancelEdits, saveEdits,
         splitSentence, mergeWithPrev, mergeWithNext,
         removeSentence, updateDraft,
         cloneSentence, buildIssueList
```
> Sentence 类型：`{ id, en, zh, status, dirty, issues }`

### useRecordingStore
```ts
state: {
  isRecording: boolean
  userAudioUrl: string | null
}
actions: toggleRecording, playComparison
```

### useFilesStore
```ts
state: {
  files: FileItem[]
}
actions: simulateUpload
```
> FileItem 类型：`{ id, title, date, duration }`

### useSettingsStore
```ts
state: {
  languages: Language[]
  selectedLanguage: string
  audioInputDevices: MediaDeviceInfo[]
  audioOutputDevices: MediaDeviceInfo[]
  selectedInputId: string
  selectedOutputId: string
}
actions: setLanguage, setInputDevice, setOutputDevice
```

---

## 3. 迁移策略

### 阶段一：脚手架
1. 安装 `npm install pinia`
2. 创建 `src/stores/` 目录，所有 store 写骨架（state + actions 空壳）
3. 创建 `src/components/` 目录结构，所有组件写空壳 `<template><div/></template>`
4. `App.vue` 引入 Pinia，渲染整体布局

### 阶段二：逐组件填充
按依赖顺序实现（先叶节点，后容器）：

```
SentenceEditor → SubtitleCard → SubtitleList → SubtitleToolbar
  → PlayerCard（内含 WaveformDisplay + PlaybackControls）
  → ListeningView → AppSidebar → TitleBar → App.vue
  → RecordingFAB → WaveformComparison → ShadowingWorkArea
  → ShadowingScriptFlow → ShadowingView
  → SettingsView
  → SubtitleToast
```

每个组件只填入来自 `ui/index.html` 的模板 + 样式，状态全部从对应 Store 读取。

### 阶段三：Store 填充
逐个 Store 将 `ui/index.html` 的 `app()` 函数中对应逻辑迁移为 actions。ListeningView 和 ShadowingView 共享 `useTranscriptStore`，但彼此无直接依赖。

---

## 4. 样式迁移原则

- Tailwind 类名直接迁移（`ui/index.html` 已使用 Tailwind CDN）
- 主题切换：两个 Store 共享同一套 Tailwind 类，由 `useAppStore.theme` 驱动
- 自定义 CSS（波形动画、滚动条隐藏等）：提取为 `src/assets/ui-shared.css`，组件中 `<style scoped>` 只放组件私有样式

---

## 5. 依赖

- `pinia: ^3.0.2`（已加入 package.json）

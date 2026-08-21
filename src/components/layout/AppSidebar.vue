<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import { useFilesStore } from '../../stores/useFilesStore'
import Icon from '../Icon.vue'

const app = useAppStore()
const files = useFilesStore()
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: !app.showSidebar }">
    <div class="sb-head">
      <span class="t hide-c">文件库</span>
      <button class="icon-btn" data-tip="收起 / 展开" @click="app.toggleSidebar()">
        <Icon :name="app.showSidebar ? 'chevron-left' : 'chevron-right'" :size="15" :stroke-width="1.8" />
      </button>
    </div>
    <button class="btn btn-import hide-c" @click="files.openFile()">
      <Icon name="plus" :size="14" :stroke-width="1.8" /> 导入音频…
    </button>
    <div class="file-list">
      <div
        v-for="file in files.files"
        :key="file.path"
        class="file-item"
        :class="{ active: files.currentFile?.path === file.path }"
        @click="files.openRecentFile(file)"
      >
        <span class="ico"><Icon name="music" :size="15" :stroke-width="1.8" /></span>
        <span class="meta hide-c">
          <span class="name">{{ file.title }}</span>
          <span class="sub">{{ file.date }} · {{ files.formatDuration(file.duration_ms) }}</span>
        </span>
        <button class="rm" data-tip="从列表移除" @click.stop="files.removeRecentFile(file.path)">
          <Icon name="xmark" :size="11" :stroke-width="1.8" />
        </button>
      </div>
      <div v-if="files.files.length === 0" class="file-empty hide-c">
        还没有文件<br>点击上方「导入音频」开始
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue'
import { useAppStore } from '../../stores/useAppStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useRecordingStore } from '../../stores/useRecordingStore'
import ShadowingWorkArea from './ShadowingWorkArea.vue'
import ShadowingScriptFlow from './ShadowingScriptFlow.vue'

const app = useAppStore()
const player = usePlayerStore()
const recording = useRecordingStore()

onUnmounted(() => {
  void player.clearSentenceSegment({ pausePlayback: true })
  recording.stopPlayback()
})
</script>

<template>
  <div class="flex-1 flex flex-row overflow-hidden"
       :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-light-bg'">
    <ShadowingWorkArea />
    <ShadowingScriptFlow />
  </div>
</template>

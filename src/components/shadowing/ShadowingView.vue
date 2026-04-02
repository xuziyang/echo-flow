<script setup lang="ts">
import { useAppStore } from '../../stores/useAppStore'
import ShadowingWorkArea from './ShadowingWorkArea.vue'
import ShadowingScriptFlow from './ShadowingScriptFlow.vue'

const app = useAppStore()
</script>

<template>
  <div class="flex-1 flex flex-row overflow-hidden"
       :class="app.theme === 'dark' ? 'bg-dark-bg' : 'bg-light-bg'">
    <ShadowingWorkArea />
    <ShadowingScriptFlow />
  </div>
</template>

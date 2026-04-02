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

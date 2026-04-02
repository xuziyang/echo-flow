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

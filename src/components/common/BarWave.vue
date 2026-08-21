<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildWaveformBars, getWaveformBarCount, getWaveformPixelWidth } from '../../composables/useWaveformBars'

/**
 * 竖条形波形：条数随时长/文本/容器宽度自适应（宽度≈时长的观感），
 * 配色使用新版主题：已播 accent / mine，未播 panel3。
 */
const props = withDefaults(defineProps<{
  samples: number[]
  progress?: number      // 0..1
  variant?: 'accent' | 'mine'
  durationMs?: number
  text?: string
}>(), {
  progress: 0,
  variant: 'accent',
  durationMs: 0,
  text: '',
})

const areaRef = ref<HTMLElement | null>(null)
const areaWidth = ref(0)

let resizeObserver: ResizeObserver | null = null

const barCount = computed(() => getWaveformBarCount(props.durationMs, props.text, areaWidth.value))
const pixelWidth = computed(() => getWaveformPixelWidth(barCount.value))
const bars = computed(() => buildWaveformBars(props.samples, barCount.value, 1))
const playedBarIndex = computed(() => (
  bars.value.length === 0 ? -1 : Math.floor(Math.max(0, Math.min(1, props.progress)) * bars.value.length)
))

function observeArea(element: HTMLElement | null) {
  resizeObserver?.disconnect()

  if (!element) {
    areaWidth.value = 0
    return
  }

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    areaWidth.value = entry.contentRect.width
  })

  resizeObserver.observe(element)
  areaWidth.value = element.clientWidth
}

onMounted(() => {
  observeArea(areaRef.value)
  watch(areaRef, observeArea)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div ref="areaRef" class="wave" :class="{ mine: variant === 'mine' }">
    <div
      v-if="bars.length > 0"
      class="bwave"
      :style="{ width: `${pixelWidth}px`, maxWidth: '100%' }"
    >
      <div
        v-for="bar in bars"
        :key="bar.index"
        class="bbar"
        :class="{ played: bar.index <= playedBarIndex }"
        :style="{ height: `${bar.height}%` }"
      />
    </div>
    <div v-else class="bwave-line"></div>
  </div>
</template>

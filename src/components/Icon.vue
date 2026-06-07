<script setup lang="ts">
import {
  Plus,
  Menu,
  Mic,
  Square,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Repeat,
  Volume2,
  Volume1,
  VolumeX,
  Settings,
  Sun,
  Moon,
  Bell,
  MoreHorizontal,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FilePen,
  X,
  PenLine,
  Trash2,
  Check,
  CheckCircle,
  Download,
  FolderOpen,
  Globe,
  GitCompare,
  Indent,
  Outdent,
  Box,
  type LucideProps,
} from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  name: string
  size?: LucideProps['size']
  strokeWidth?: LucideProps['strokeWidth']
}>()

const icons: Record<string, unknown> = {
  plus: Plus,
  bars: Menu,
  indent: Indent,
  outdent: Outdent,
  microphone: Mic,
  stop: Square,
  play: Play,
  pause: Pause,
  'backward-step': SkipBack,
  'forward-step': SkipForward,
  'rotate-left': RotateCcw,
  repeat: Repeat,
  'volume-high': Volume2,
  'volume-low': Volume1,
  'volume-xmark': VolumeX,
  gear: Settings,
  sun: Sun,
  moon: Moon,
  bell: Bell,
  ellipsis: MoreHorizontal,
  'arrow-left': ArrowLeft,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'pen-to-square': FilePen,
  xmark: X,
  pen: PenLine,
  trash: Trash2,
  check: Check,
  'circle-check': CheckCircle,
  download: Download,
  folder: FolderOpen,
  globe: Globe,
  'code-compare': GitCompare,
  box: Box,
}

const iconComponent = computed(() => icons[props.name])
</script>

<template>
  <component
    :is="iconComponent"
    v-if="iconComponent"
    :size="size ?? 16"
    :stroke-width="strokeWidth ?? 2"
    v-bind="$attrs"
  />
</template>

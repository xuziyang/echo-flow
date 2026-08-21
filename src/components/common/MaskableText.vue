<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/** 可遮蔽文本：masked 时按词打码成灰块（块长即词长），点击可临时显示 */
const props = defineProps<{
  text: string
  masked: boolean
}>()

const revealed = ref(false)

watch(() => [props.text, props.masked] as const, () => {
  revealed.value = false
})

const tokens = computed(() => props.text.split(/(\s+)/))
</script>

<template>
  <span v-if="!masked">{{ text }}</span>
  <span
    v-else
    class="masked-text"
    :class="{ revealed }"
    @click.stop="revealed = !revealed"
  ><template v-for="(token, i) in tokens" :key="i"><span v-if="token.trim()" class="mw">{{ token }}</span><template v-else>{{ token }}</template></template></span>
</template>

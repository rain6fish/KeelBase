<template>
  <i :class="['mdi', iconClass]" :style="style" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** Vuetify v-icon 的 Element Plus 替代：渲染 @mdi/font 图标。icon 形如 "mdi-xxx"。 */
const props = withDefaults(
  defineProps<{
    icon: string
    size?: number | string
    color?: string
  }>(),
  { size: undefined, color: undefined },
)

const iconClass = computed(() =>
  props.icon.startsWith('mdi-') ? props.icon : `mdi-${props.icon}`,
)
const style = computed(() => ({
  fontSize: props.size ? (typeof props.size === 'number' ? `${props.size}px` : props.size) : undefined,
  color: props.color,
}))
</script>

<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-card
    shadow="never"
    class="stat-card"
    :class="{ 'stat-card--clickable': clickable }"
    :tabindex="clickable ? 0 : undefined"
    @click="onClick"
    @keyup.enter="onClick"
  >
    <div class="d-flex align-center ga-3">
      <div
        class="flex-shrink-0 d-flex align-center justify-center"
        :style="{ width: '48px', height: '48px', borderRadius: 'var(--keel-radius-md)', background: lightBg }"
      >
        <AppIcon :icon="icon" size="26" :color="iconColor" />
      </div>
      <div style="min-width: 0">
        <div class="text-caption text-medium-emphasis">{{ label }}</div>
        <div class="text-h5 font-weight-bold text-tabular text-truncate" :title="String(value)">{{ value }}</div>
        <div v-if="hint" class="text-caption text-medium-emphasis">{{ hint }}</div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, withDefaults } from 'vue'

// 语义色 → Element Plus CSS 变量（图标色 + 浅色底）
const colorVar: Record<string, string> = {
  primary: 'var(--el-color-primary)',
  info: 'var(--el-color-info)',
  success: 'var(--el-color-success)',
  warning: 'var(--el-color-warning)',
  error: 'var(--el-color-error)',
}

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    icon: string
    color?: string
    hint?: string
    /** 可点指标卡：作为对应功能的入口（页面监听 click 导航） */
    clickable?: boolean
  }>(),
  { color: 'primary' },
)

const emit = defineEmits<{ (e: 'click'): void }>()

function onClick() {
  if (props.clickable) emit('click')
}

const iconColor = computed(() => colorVar[props.color] ?? 'var(--el-color-primary)')
const lightBg = computed(
  () => `var(--el-color-${props.color === 'error' ? 'danger' : props.color}-light-9)`,
)
</script>

<style scoped>
.stat-card--clickable {
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s, transform 0.2s;
}
.stat-card--clickable:hover {
  border-color: var(--el-color-primary);
  box-shadow: var(--el-box-shadow-light);
  transform: translateY(-1px);
}
.stat-card--clickable:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
</style>

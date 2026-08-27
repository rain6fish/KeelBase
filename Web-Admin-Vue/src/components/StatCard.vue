<template>
  <el-card shadow="never" class="stat-card">
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
  }>(),
  { color: 'primary' },
)

const iconColor = computed(() => colorVar[props.color] ?? 'var(--el-color-primary)')
const lightBg = computed(
  () => `var(--el-color-${props.color === 'error' ? 'danger' : props.color}-light-9)`,
)
</script>

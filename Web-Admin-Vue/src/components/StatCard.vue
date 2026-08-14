<template>
  <v-card class="stat-card">
    <v-card-text class="d-flex align-center ga-3">
      <v-avatar :color="lightColor(color)" rounded="md" size="48" class="flex-shrink-0">
        <v-icon :icon="icon" size="26" :color="color" />
      </v-avatar>
      <div>
        <div class="text-caption text-medium-emphasis">{{ label }}</div>
        <div class="text-h5 font-weight-bold">{{ value }}</div>
        <div v-if="hint" class="text-caption text-medium-emphasis">{{ hint }}</div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { withDefaults } from 'vue'

// 浅色底映射：主色语义色 → 对应 light 变体（供图标底色，对齐 Matdash 统计卡形态）
const lightMap: Record<string, string> = {
  primary: 'lightprimary',
  info: 'lightinfo',
  success: 'lightsuccess',
  warning: 'lightwarning',
  error: 'lighterror',
}
function lightColor(color: string): string {
  return lightMap[color] ?? 'lightprimary'
}

withDefaults(
  defineProps<{
    label: string
    value: string | number
    icon: string
    color?: string
    hint?: string
  }>(),
  { color: 'primary' },
)
</script>

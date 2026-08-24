<template>
  <el-popover placement="top" :width="240" trigger="click">
    <template #reference>
      <el-button circle :title="t('theme')">
        <AppIcon icon="mdi-palette-outline" />
      </el-button>
    </template>

    <div class="theme-switcher">
      <div class="text-caption font-weight-medium mb-2">{{ t('theme') }}</div>
      <div
        v-for="v in VARIANTS"
        :key="v.id"
        class="theme-row d-flex align-center ga-2 pa-1"
        @click="ui.setVariant(v.id)"
      >
        <span class="swatch" :style="{ background: v.color }" />
        <span class="text-body-2 flex-grow-1">{{ t(v.label) }}</span>
        <AppIcon
          v-if="ui.variant === v.id"
          icon="mdi-check"
          size="16"
          color="var(--el-color-primary)"
        />
      </div>
      <el-divider class="my-2" />
      <div class="d-flex align-center justify-space-between">
        <span class="text-body-2">{{ t('toggleTheme') }}</span>
        <ThemeToggle />
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import type { ThemeVariant } from '@/utils/theme'
import ThemeToggle from './ThemeToggle.vue'

const ui = useUiStore()
const { t } = useI18n()

const VARIANTS: Array<{ id: ThemeVariant; color: string; label: string }> = [
  { id: 'purple', color: '#6d28d9', label: 'themePurple' },
  { id: 'teal', color: '#0e9384', label: 'themeTeal' },
  { id: 'graphite', color: '#d97706', label: 'themeGraphite' },
]
</script>

<style scoped>
.theme-row {
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s ease;
}
.theme-row:hover {
  background: var(--el-fill-color-light);
}
.swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 6px;
  flex-shrink: 0;
}
</style>

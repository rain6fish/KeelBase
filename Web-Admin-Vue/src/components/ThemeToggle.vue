<template>
  <el-button circle :title="t('toggleTheme')" @click="ui.toggleTheme()">
    <AppIcon :icon="ui.theme === 'light' ? 'mdi-weather-night' : 'mdi-white-balance-sunny'" />
  </el-button>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const { t } = useI18n()

// html.dark 驱动 Element Plus CSS 变量（element-theme.scss 深色覆盖）
watch(
  () => ui.theme,
  (val) => {
    document.documentElement.classList.toggle('dark', val === 'dark')
  },
  { immediate: true },
)
</script>

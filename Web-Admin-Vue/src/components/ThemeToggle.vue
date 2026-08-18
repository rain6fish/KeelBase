<template>
  <el-button circle :title="t('toggleTheme')" @click="ui.toggleTheme()">
    <AppIcon :icon="ui.theme === 'light' ? 'mdi-weather-night' : 'mdi-white-balance-sunny'" />
  </el-button>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const { t } = useI18n()
const theme = useTheme()

// 迁移期双同步：html.dark 驱动 Element Plus CSS 变量；Vuetify 主题保持（阶段 D 移除后只留 html.dark）
watch(
  () => ui.theme,
  (val) => {
    document.documentElement.classList.toggle('dark', val === 'dark')
    theme.global.name.value = val
  },
  { immediate: true },
)
</script>

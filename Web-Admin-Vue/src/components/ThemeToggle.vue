<template>
  <el-button circle :title="t('toggleTheme')" @click="ui.toggleTheme()">
    <AppIcon :icon="ui.theme === 'light' ? 'mdi-weather-night' : 'mdi-white-balance-sunny'" />
  </el-button>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const { t } = useI18n()
</script>

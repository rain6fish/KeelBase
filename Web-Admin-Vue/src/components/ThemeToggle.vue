<template>
  <v-btn
    :icon="ui.theme === 'light' ? 'mdi-weather-night' : 'mdi-white-balance-sunny'"
    variant="text"
    :title="t('toggleTheme')"
    @click="ui.toggleTheme()"
  />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const { t } = useI18n()
const theme = useTheme()

// 同步 Vuetify 主题到当前 store 值
watch(
  () => ui.theme,
  (val) => {
    theme.global.name.value = val
  },
  { immediate: true },
)
</script>

<template>
  <el-config-provider>
    <router-view />
    <GlobalSnackbar />
  </el-config-provider>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import GlobalSnackbar from '@/components/GlobalSnackbar.vue'
import { useUiStore } from '@/stores/ui'
import { applyTheme } from '@/utils/theme'

const ui = useUiStore()
// 集中应用主题（首个 paint 前），并修复登录页从不应用暗色/主题变体的问题
watch(
  () => [ui.theme, ui.variant] as const,
  ([mode, variant]) => applyTheme(mode, variant),
  { immediate: true },
)
</script>

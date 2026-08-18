<template>
  <el-button :title="t('toggleLang')" @click="locale.toggle()">
    {{ locale.locale === 'zh' ? 'EN' : '中文' }}
  </el-button>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLocaleStore } from '@/i18n'

const locale = useLocaleStore()
const { t } = useI18n()
</script>

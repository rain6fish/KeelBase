<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="d-flex align-center justify-center" style="min-height: 100vh">
    <el-card shadow="never" class="text-center px-10 py-8">
      <AppIcon icon="mdi-shield-lock-outline" :size="64" color="var(--el-color-danger)" class="mb-3" />
      <div class="text-h5 font-weight-bold mb-2">{{ t('forbidden') }}</div>
      <div class="text-body-2 text-medium-emphasis mb-4">{{ t('forbiddenHint') }}</div>
      <el-button type="primary" @click="$router.push('/login')">{{ t('back') }}</el-button>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

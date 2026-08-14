<template>
  <v-main class="d-flex align-center justify-center">
    <v-card class="text-center px-10 py-8">
      <v-icon icon="mdi-shield-lock-outline" size="64" color="error" class="mb-3" />
      <div class="text-h5 font-weight-bold mb-2">{{ t('forbidden') }}</div>
      <div class="text-body-2 text-medium-emphasis mb-4">{{ t('forbiddenHint') }}</div>
      <v-btn color="primary" :to="'/login'">{{ t('back') }}</v-btn>
    </v-card>
  </v-main>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

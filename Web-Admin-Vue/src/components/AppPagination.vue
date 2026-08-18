<template>
  <div class="d-flex align-center justify-end ga-2 py-2">
    <span class="text-caption text-medium-emphasis">{{ t('total', { n: total }) }}</span>
    <el-pagination
      :current-page="page"
      :page-size="limit"
      :total="total"
      layout="prev, pager, next"
      background
      :disabled="loading"
      @current-change="emit('update:page', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  page: number
  limit: number
  total: number
  loading?: boolean
}>()
const emit = defineEmits<{ (e: 'update:page', page: number): void }>()
const { t } = useI18n()
</script>

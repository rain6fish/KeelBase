<template>
  <div class="d-flex align-center justify-end ga-2 py-2">
    <span class="text-caption text-medium-emphasis">
      {{ t('total', { n: total }) }}
    </span>
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      size="small"
      :disabled="page <= 1 || loading"
      @click="emit('update:page', page - 1)"
    />
    <span class="text-caption">
      {{ t('pageInfo', { page, pages: pages }) }}
    </span>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      size="small"
      :disabled="page >= pages || loading"
      @click="emit('update:page', page + 1)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  page: number
  limit: number
  total: number
  loading?: boolean
}>()
const emit = defineEmits<{ (e: 'update:page', page: number): void }>()
const { t } = useI18n()

const pages = computed(() => (props.total ? Math.max(1, Math.ceil(props.total / props.limit)) : 1))
</script>

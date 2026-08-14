<template>
  <v-select
    :model-value="modelValue"
    :items="rangeOptions"
    item-title="label"
    item-value="key"
    :label="t('timeRange')"
    density="comfortable"
    variant="outlined"
    hide-details
    style="max-width: 160px"
    @update:model-value="onChange"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RANGE_OPTIONS, sinceForOption, type RangeOption } from '@/utils/range'

defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', key: string, since?: string): void
}>()
const { t } = useI18n()

const rangeOptions = computed(() =>
  RANGE_OPTIONS.map((o) => ({
    key: o.key,
    label: t(`range${o.key === 'all' ? 'All' : o.key === 'today' ? 'Today' : o.key === '7d' ? '7d' : '30d'}`),
  })),
)

function onChange(key: string) {
  const option = RANGE_OPTIONS.find((o) => o.key === key) as RangeOption
  emit('update:modelValue', key, sinceForOption(option))
}
</script>

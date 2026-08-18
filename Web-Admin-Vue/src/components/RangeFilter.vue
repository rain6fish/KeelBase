<template>
  <el-select :model-value="modelValue" style="max-width: 160px" @update:model-value="onChange">
    <el-option v-for="o in rangeOptions" :key="o.key" :label="o.label" :value="o.key" />
  </el-select>
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

function onChange(key: string | number | boolean | undefined) {
  const k = key == null ? 'all' : String(key)
  const option = RANGE_OPTIONS.find((o) => o.key === k) as RangeOption
  emit('update:modelValue', k, sinceForOption(option))
}
</script>

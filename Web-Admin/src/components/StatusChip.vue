<template>
  <v-chip size="small" :color="color" variant="tonal">
    {{ label }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** 语义值：ok/error/active/cancelled/read/unread/up/down/true/false 等 */
  status: string | boolean | number | null | undefined
  /** 可选：传入 map 覆盖默认映射 */
  colorMap?: Record<string, string>
  labelMap?: Record<string, string>
}>()

const color = computed(() => {
  const s = String(props.status ?? '').toLowerCase()
  if (props.colorMap?.[s]) return props.colorMap[s]
  const map: Record<string, string> = {
    ok: 'success',
    up: 'success',
    active: 'success',
    true: 'success',
    success: 'success',
    error: 'error',
    down: 'error',
    cancelled: 'warning',
    false: 'default',
    unread: 'info',
    read: 'success',
    normal: 'success',
  }
  return map[s] || 'default'
})

const label = computed(() => {
  const s = String(props.status ?? '')
  if (props.labelMap?.[s]) return props.labelMap[s]
  return s
})
</script>

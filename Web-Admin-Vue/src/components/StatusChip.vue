<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-tag size="small" :type="tagType" effect="plain">{{ label }}</el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** 语义值：ok/error/active/cancelled/read/unread/up/down/true/false 等 */
  status: string | boolean | number | null | undefined
  /** 可选：传入 map 覆盖默认映射（值映射到 el-tag type：success/warning/info/danger/primary） */
  colorMap?: Record<string, string>
  labelMap?: Record<string, string>
}>()

const tagType = computed(() => {
  const s = String(props.status ?? '').toLowerCase()
  if (props.colorMap?.[s]) return props.colorMap[s]
  const map: Record<string, string> = {
    ok: 'success',
    up: 'success',
    active: 'success',
    true: 'success',
    success: 'success',
    normal: 'success',
    read: 'success',
    error: 'danger',
    down: 'danger',
    cancelled: 'warning',
    unread: 'info',
    false: 'info',
    default: 'info',
  }
  return map[s] || 'info'
})

const label = computed(() => {
  const s = String(props.status ?? '')
  if (props.labelMap?.[s]) return props.labelMap[s]
  return s
})
</script>

<template>
  <div />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSnackbarStore } from '@/stores/snackbar'

/** Element Plus 版：监听 snackbar store，新条目以 ElMessage 弹出（自动堆叠 + 可关闭）。 */
const snackbar = useSnackbarStore()
const seen = new Set<number>()

watch(
  () => snackbar.items.map((i) => i.id).join(','),
  () => {
    for (const item of snackbar.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      ElMessage({
        message: item.message,
        type: item.type as 'success' | 'warning' | 'info' | 'error',
        grouping: true,
        onClose: () => snackbar.dismiss(item.id),
      })
    }
  },
  { immediate: true },
)
</script>

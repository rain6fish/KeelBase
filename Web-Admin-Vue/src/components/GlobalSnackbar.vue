<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div />
</template>

<script setup lang="ts">
import { h, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
// ElMessage 是编程式 API（非模板 el-* 组件），unplugin 不自动注入其样式，需显式引入。
import 'element-plus/theme-chalk/el-message.css'
import { useSnackbarStore } from '@/stores/snackbar'

/** Element Plus 版：监听 snackbar store，新条目以 ElMessage 弹出（自动堆叠 + 可关闭）。 */
const snackbar = useSnackbarStore()
const { t } = useI18n()
const seen = new Set<number>()

/** NC-2 错误卡：标题 message + 原因/影响/下一步（可执行指引），否则回落单句 toast */
function messageNode(item: { message: string; reason?: string; impact?: string; nextStep?: string }) {
  const actionable = !!(item.reason || item.impact || item.nextStep)
  if (!actionable) return item.message
  const line = (label: string, value: string) =>
    h('div', { style: 'margin-top:4px;font-size:12.5px;line-height:1.5' }, [
      h('span', { style: 'font-weight:600;margin-right:4px' }, label),
      value,
    ])
  const rows = [
    h('div', { style: 'font-weight:600' }, item.message),
    ...(item.reason ? [line(t('errorReason'), item.reason)] : []),
    ...(item.impact ? [line(t('errorImpact'), item.impact)] : []),
    ...(item.nextStep ? [line(t('errorNextStep'), item.nextStep)] : []),
  ]
  return h('div', { style: 'max-width:360px' }, rows)
}

watch(
  () => snackbar.items.map((i) => i.id).join(','),
  () => {
    for (const item of snackbar.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      const actionable = !!(item.reason || item.impact || item.nextStep)
      ElMessage({
        message: messageNode(item),
        type: item.type as 'success' | 'warning' | 'info' | 'error',
        grouping: true,
        duration: actionable ? 8000 : 3000,
        onClose: () => snackbar.dismiss(item.id),
      })
    }
  },
  { immediate: true },
)
</script>

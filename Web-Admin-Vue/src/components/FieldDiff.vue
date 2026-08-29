<template>
  <div class="field-diff">
    <table v-if="rows.length" class="field-diff-table">
      <thead>
        <tr>
          <th>{{ t('diffField') }}</th>
          <th>{{ t('diffBefore') }}</th>
          <th>{{ t('diffAfter') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.field">
          <td class="diff-field">{{ r.field }}</td>
          <td>
            <span :class="r.before !== null ? 'diff-old' : 'text-medium-emphasis'">{{ formatCell(r.before) }}</span>
          </td>
          <td><span class="diff-new">{{ formatCell(r.after) }}</span></td>
        </tr>
      </tbody>
    </table>
    <div v-else class="text-medium-emphasis text-body-2">{{ t('diffNoChange') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * E-1 字段级变更审计只读 diff：
 * - 有 before → 仅展示发生变更的字段（before → after）
 * - 无 before（create 类 / 外部写）→ 全量展示 after 字段（"已创建"态）
 * - before/after 双空 → "无字段变更"
 */
const props = defineProps<{ before?: string | null; after?: string | null }>()

const { t } = useI18n()

function parse(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const beforeObj = computed(() => parse(props.before))
const afterObj = computed(() => parse(props.after))

const rows = computed(() => {
  const before = beforeObj.value
  const after = afterObj.value
  if (!after) return []
  if (!before) {
    return Object.entries(after).map(([field, v]) => ({ field, before: null, after: v }))
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys]
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, before: before[k] ?? null, after: after[k] ?? null }))
})

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
</script>

<style scoped>
.field-diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.5;
}
.field-diff-table th,
.field-diff-table td {
  border: 1px solid var(--el-border-color-lighter);
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
  word-break: break-all;
}
.field-diff-table th {
  background: var(--el-fill-color-light);
  font-weight: 500;
  color: var(--el-text-color-secondary);
}
.diff-field {
  color: var(--el-text-color-primary);
  white-space: nowrap;
}
.diff-old {
  color: var(--el-color-danger);
  text-decoration: line-through;
}
.diff-new {
  color: var(--el-color-success);
}
</style>

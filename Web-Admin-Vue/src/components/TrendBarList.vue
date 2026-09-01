<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <div v-if="days.length">
      <div v-for="d in days" :key="d.date" class="mb-2">
        <div class="d-flex justify-space-between align-center text-caption text-medium-emphasis">
          <span>{{ d.date }}</span>
          <span>{{ dailyTotal(d) }}</span>
        </div>
        <div class="trend-bar">
          <template v-for="seg in segments" :key="seg.key">
            <div
              v-if="d[seg.key]"
              class="trend-seg"
              :style="{ width: pct(d[seg.key]) + '%', background: seg.color }"
              :title="`${t(seg.label)}: ${d[seg.key]}`"
            />
          </template>
        </div>
      </div>
      <div class="d-flex flex-wrap ga-3 text-caption text-medium-emphasis mt-1">
        <span v-for="seg in segments" :key="seg.key" class="d-flex align-center ga-1">
          <span class="trend-dot" :style="{ background: seg.color }" />{{ t(seg.label) }}
        </span>
      </div>
    </div>
    <div v-else class="text-medium-emphasis">{{ t('secNoActionLog') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AuditByDayBucket } from '@/types/audit'

/** E-2 按日趋势：纯 CSS 5 段堆叠条（executed/approved/rejected/blocked/errors），无图表库 */
const props = defineProps<{ days: AuditByDayBucket[] }>()

const { t } = useI18n()

const segments = [
  { key: 'executed', color: 'var(--el-color-primary)', label: 'secActionExecuted' },
  { key: 'approved', color: 'var(--el-color-success)', label: 'secActionApproved' },
  { key: 'rejected', color: 'var(--el-color-warning)', label: 'secActionRejected' },
  { key: 'blocked', color: 'var(--el-color-danger)', label: 'secActionBlocked' },
  { key: 'errors', color: '#b91c1c', label: 'secActionErrors' },
] as const

const maxDaily = computed(() =>
  Math.max(1, ...props.days.map((d) => d.executed + d.approved + d.rejected + d.blocked + d.errors)),
)

function dailyTotal(d: AuditByDayBucket): number {
  return d.executed + d.approved + d.rejected + d.blocked + d.errors
}

function pct(v: number): number {
  return Math.round((v / maxDaily.value) * 100)
}
</script>

<style scoped>
.trend-bar {
  display: flex;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}
.trend-seg {
  height: 100%;
}
.trend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
</style>

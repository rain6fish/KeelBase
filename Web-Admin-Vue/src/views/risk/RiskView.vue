<template>
  <div>
    <PageHeader :title="t('navRisk')" :subtitle="t('riskCenterHint')">
      <el-button @click="loadAll">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <el-row :gutter="16" class="mb-4">
      <el-col v-for="c in statCards" :key="c.key" :xs="24" :sm="12" :md="6" class="mb-3">
        <el-card shadow="never">
          <div class="text-h6 font-weight-bold" :style="{ color: c.color }">{{ c.value }}</div>
          <div class="text-caption text-medium-emphasis">{{ c.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :md="12" class="mb-4">
        <el-card shadow="never">
          <template #header>{{ t('riskDistribution') }}</template>
          <div v-for="l in riskRows" :key="l.level" class="d-flex align-center ga-3 mb-2">
            <el-tag size="small" :type="l.type" effect="light" style="width: 80px" class="text-center">{{ l.level }}</el-tag>
            <el-progress :percentage="l.pct" :stroke-width="10" class="flex-grow-1" />
            <span class="text-body-2">{{ l.count }}</span>
          </div>
          <div v-if="!riskRows.length" class="text-medium-emphasis">{{ t('noData') }}</div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12" class="mb-4">
        <el-card shadow="never">
          <template #header>{{ t('highRiskTools') }}</template>
          <el-table v-if="highRiskTools.length" :data="highRiskTools" size="small">
            <el-table-column prop="name" :label="t('tool')" min-width="160" />
            <el-table-column prop="riskLevel" :label="t('riskLevel')" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="riskTag(row).type" effect="light">{{ row.riskLevel }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('requiresConfirmation')" width="110" align="center">
              <template #default="{ row }">
                <span v-if="row.requiresConfirmation" class="text-warning">✓</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="text-medium-emphasis pa-3">{{ t('noData') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="riskLogs.length" shadow="never">
      <template #header>{{ t('recentRiskOps') }}</template>
      <div v-for="l in riskLogs.slice(0, 8)" :key="l.id" class="d-flex align-center ga-3 mb-2">
        <el-tag size="small" :type="l.isError ? 'danger' : 'warning'" effect="light">
          {{ l.isError ? t('aiBlocked') : t('riskAlert') }}
        </el-tag>
        <span class="font-weight-medium">{{ l.actionLabel || l.action }}</span>
        <span class="text-caption text-medium-emphasis text-truncate">{{ l.errorMessage || (l.authorization ? t('deniedReason') : '') }}</span>
        <span class="text-caption text-medium-emphasis ml-auto">{{ formatTime(l.createdAt) }}</span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { auditApi } from '@/api/audit'
import { formatTime } from '@/utils/format'
import type { AdminAiTool } from '@/types/admin'
import type { ActionReport, AuditLog } from '@/types/audit'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const tools = ref<AdminAiTool[]>([])
const report = ref<ActionReport | null>(null)
const riskLogs = ref<AuditLog[]>([])

function riskTag(tool: AdminAiTool) {
  const lv = tool.riskLevel || ''
  if (lv === 'R5') return { label: t('riskBlocked'), type: 'danger' as const }
  if (lv === 'R4') return { label: t('riskApproval'), type: 'warning' as const }
  if (lv === 'R3') return { label: t('riskConfirm'), type: 'warning' as const }
  return { label: t('riskAuto'), type: 'success' as const }
}

const statCards = computed(() => [
  { key: 'tools', label: t('toolTotal'), value: tools.value.length, color: 'var(--el-color-primary)' },
  { key: 'highRisk', label: t('highRiskTools'), value: highRiskTools.value.length, color: 'var(--el-color-danger)' },
  { key: 'blocked', label: t('aiBlocked'), value: report.value?.summary.blocked ?? 0, color: 'var(--el-color-danger)' },
  { key: 'errors', label: t('aiErrors'), value: report.value?.summary.errors ?? 0, color: 'var(--el-color-warning)' },
])

const riskRows = computed(() => {
  const counts: Record<string, number> = {}
  for (const tool of tools.value) {
    const lv = tool.riskLevel || 'R1'
    counts[lv] = (counts[lv] ?? 0) + 1
  }
  const total = tools.value.length || 1
  const typeMap: Record<string, 'danger' | 'warning' | 'success' | 'info'> = {
    R5: 'danger', R4: 'warning', R3: 'warning', R2: 'success', R1: 'success',
  }
  return ['R1', 'R2', 'R3', 'R4', 'R5']
    .filter((lv) => counts[lv])
    .map((lv) => ({ level: lv, count: counts[lv], pct: Math.round((counts[lv] / total) * 100), type: typeMap[lv] || 'info' }))
})

const highRiskTools = computed(() => tools.value.filter((x) => x.riskLevel === 'R4' || x.riskLevel === 'R5'))

async function loadAll() {
  try {
    const [toolsRes, reportRes, logsRes] = await Promise.all([
      aiToolsApi.tools(),
      auditApi.actionReport(),
      auditApi.logs({ limit: 100 }),
    ])
    tools.value = toolsRes
    report.value = reportRes
    riskLogs.value = logsRes.filter((l) => l.isError || !!l.authorization)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

onMounted(loadAll)
</script>

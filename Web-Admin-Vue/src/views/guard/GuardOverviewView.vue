<template>
  <div>
    <PageHeader :title="t('navGuardOverview')" :subtitle="t('guardOverviewHint')">
      <el-button @click="loadAll">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <!-- 五中心统计卡 -->
    <el-row :gutter="16" class="mb-4">
      <el-col v-for="card in statCards" :key="card.key" :xs="24" :sm="12" :md="8" :lg="6" class="mb-3">
        <el-card shadow="never" class="stat-card" @click="go(card.to)">
          <div class="d-flex align-center ga-3">
            <div class="stat-icon" :style="{ background: card.bg }"><AppIcon :icon="card.icon" :size="20" color="#fff" /></div>
            <div>
              <div class="text-h6 font-weight-bold">{{ card.value }}</div>
              <div class="text-caption text-medium-emphasis">{{ card.label }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 风险分布 -->
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

      <!-- 审计态势 -->
      <el-col :xs="24" :md="12" class="mb-4">
        <el-card shadow="never">
          <template #header>{{ t('auditPosture') }}</template>
          <div class="d-flex flex-wrap ga-3 mb-3">
            <div v-for="s in auditStats" :key="s.label" class="d-flex flex-column align-center pa-3" style="border: 1px solid var(--el-border-color-light); border-radius: 8px; min-width: 84px">
              <span class="text-h6 font-weight-bold" :style="{ color: s.color }">{{ s.value }}</span>
              <span class="text-caption text-medium-emphasis">{{ s.label }}</span>
            </div>
          </div>
          <el-alert
            v-if="report"
            :type="report.hashChain.valid ? 'success' : 'error'"
            :closable="false"
          >
            {{ report.hashChain.valid ? t('chainValid') : t('chainBroken') }}（checked={{ report.hashChain.checked }}）
          </el-alert>
        </el-card>
      </el-col>
    </el-row>

    <!-- 待人工审批 -->
    <el-card v-if="approvals.length" shadow="never">
      <template #header>
        <div class="d-flex align-center ga-2">
          {{ t('pendingApprovals') }}
          <el-tag size="small" type="warning" effect="light">{{ approvals.length }}</el-tag>
          <el-button link type="primary" size="small" class="ml-auto" @click="go('/ai-approvals')">{{ t('viewAll') }}</el-button>
        </div>
      </template>
      <div v-for="a in approvals.slice(0, 6)" :key="a.id" class="d-flex align-center ga-3 mb-2">
        <el-tag size="small" :type="a.riskLevel === 'R4' ? 'warning' : 'info'" effect="light">{{ a.riskLevel }}</el-tag>
        <span class="font-weight-medium">{{ a.toolName }}</span>
        <span class="text-caption text-medium-emphasis text-truncate">{{ a.args }}</span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { auditApi } from '@/api/audit'
import type { AdminAiTool, AiAgent, AiApprovalRequest } from '@/types/admin'
import type { ActionReport } from '@/types/audit'

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const agents = ref<AiAgent[]>([])
const tools = ref<AdminAiTool[]>([])
const approvals = ref<AiApprovalRequest[]>([])
const report = ref<ActionReport | null>(null)

const statCards = computed(() => [
  { key: 'agents', to: '/agent-registry', icon: 'mdi-robot-outline', label: t('navAgents'), value: agents.value.length, bg: 'var(--el-color-primary)' },
  { key: 'policy', to: '/policy-center', icon: 'mdi-shield-key-outline', label: t('navPolicyCenter'), value: tools.value.length, bg: '#0ea5e9' },
  { key: 'approval', to: '/ai-approvals', icon: 'mdi-shield-check-outline', label: t('pendingApprovals'), value: approvals.value.length, bg: 'var(--el-color-warning)' },
  { key: 'audit', to: '/audit', icon: 'mdi-history', label: t('aiExecuted'), value: report.value?.summary.executed ?? 0, bg: 'var(--el-color-success)' },
  { key: 'blocked', to: '/audit', icon: 'mdi-shield-alert-outline', label: t('aiBlocked'), value: report.value?.summary.blocked ?? 0, bg: 'var(--el-color-danger)' },
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

const auditStats = computed(() => {
  const s = report.value?.summary
  if (!s) return []
  return [
    { label: t('aiExecuted'), value: s.executed, color: 'var(--el-color-success)' },
    { label: t('aiApproved'), value: s.approved, color: 'var(--el-color-primary)' },
    { label: t('aiRejected'), value: s.rejected, color: 'var(--el-color-info)' },
    { label: t('aiBlocked'), value: s.blocked, color: 'var(--el-color-danger)' },
    { label: t('aiErrors'), value: s.errors, color: 'var(--el-color-warning)' },
  ]
})

async function loadAll() {
  try {
    const [agentsRes, toolsRes, approvalsRes, reportRes] = await Promise.all([
      aiToolsApi.agents(),
      aiToolsApi.tools(),
      aiToolsApi.approvals(),
      auditApi.actionReport(),
    ])
    agents.value = agentsRes
    tools.value = toolsRes
    approvals.value = approvalsRes
    report.value = reportRes
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

function go(path: string) {
  router.push(path)
}

onMounted(loadAll)
</script>

<style scoped>
.stat-card {
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.stat-card:hover {
  box-shadow: var(--el-box-shadow-light);
}
.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

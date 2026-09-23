<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navAiApprovals')" :subtitle="t('aiApprovalsHint')">
      <el-button @click="loadAll()">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <!-- 待审批（R4 双人审批：approver 决策） -->
    <el-card shadow="never" class="mb-4">
      <template #header>{{ t('aiApprovalsPending') }}</template>
      <AppTable :headers="pendingHeaders" :items="pending" :loading="loading">
        <template #item.riskLevel="{ item }">
          <el-tag size="small" :type="item.riskLevel === 'R4' ? 'warning' : 'info'" effect="light">{{ item.riskLevel }}</el-tag>
        </template>
        <template #item.toolName="{ item }">{{ toolLabel(tm('feature'), item.toolName) }}</template>
        <template #item.path="{ item }">
          <span class="text-body-2">{{ item.operatorName || item.operatorId }} → {{ t('aiApprovalsPending') }}</span>
        </template>
        <template #item.args="{ item }">
          <el-popover placement="top" :width="380" trigger="click">
            <template #reference>
              <span class="text-caption" style="cursor:pointer;border-bottom:1px dashed #cbd5e1">
                {{ toolArgsSummary(item.toolName, item.args, locale.startsWith('zh')) || t('aiApprovalsArgs') }}
              </span>
            </template>
            <pre class="text-caption" style="white-space:pre-wrap;margin:0">{{ item.args }}</pre>
          </el-popover>
        </template>
        <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
        <template #item.actions="{ item }">
          <el-button size="small" type="success" :loading="actingToken === item.token" @click="onDecide(item, 'approve')">
            {{ t('aiApprovalsApprove') }}
          </el-button>
          <el-button size="small" type="danger" plain :loading="actingToken === item.token" @click="onDecide(item, 'decline')">
            {{ t('aiApprovalsDecline') }}
          </el-button>
        </template>
      </AppTable>
      <div v-if="!loading && pending.length === 0" class="text-medium-emphasis pa-3">{{ t('aiApprovalsEmpty') }}</div>
    </el-card>

    <!-- 已审批历史 -->
    <el-card shadow="never">
      <template #header>{{ t('aiApprovalsDecided') }}</template>
      <AppTable :headers="decidedHeaders" :items="decided" :loading="loading">
        <template #item.riskLevel="{ item }">
          <el-tag size="small" :type="item.riskLevel === 'R4' ? 'warning' : 'info'" effect="light">{{ item.riskLevel }}</el-tag>
        </template>
        <template #item.toolName="{ item }">{{ toolLabel(tm('feature'), item.toolName) }}</template>
        <template #item.path="{ item }">
          <span class="text-body-2">{{ item.operatorName || item.operatorId }} → {{ item.approverName || item.approverId || '-' }}</span>
        </template>
        <template #item.args="{ item }">
          <el-popover placement="top" :width="380" trigger="click">
            <template #reference>
              <span class="text-caption" style="cursor:pointer;border-bottom:1px dashed #cbd5e1">
                {{ toolArgsSummary(item.toolName, item.args, locale.startsWith('zh')) || t('aiApprovalsArgs') }}
              </span>
            </template>
            <pre class="text-caption" style="white-space:pre-wrap;margin:0">{{ item.args }}</pre>
          </el-popover>
        </template>
        <template #item.status="{ item }">
          <StatusChip :status="item.status === 'approved' ? 'ok' : 'cancelled'" :label-map="statusMap" />
        </template>
        <!-- P2 执行轴：批准 ≠ 执行成功。失败/未执行的行在此如实显示，并可重试。 -->
        <template #item.execution="{ item }">
          <el-tag
            v-if="executionTag(item)"
            size="small"
            effect="plain"
            :type="executionTag(item)!.type"
            :title="item.executionError || ''"
          >{{ executionTag(item)!.label }}</el-tag>
          <span v-else>-</span>
        </template>
        <template #item.decidedAt="{ item }">{{ item.decidedAt ? formatTime(item.decidedAt) : '-' }}</template>
        <template #item.audit="{ item }">
          <el-button
            v-if="canRetry(item)"
            link
            type="warning"
            size="small"
            :loading="actingToken === item.token"
            @click="onRetry(item)"
          >{{ t('aiApprovalsRetry') }}</el-button>
          <el-button link type="primary" size="small" @click="router.push({ path: '/audit', query: { userId: item.operatorId } })">
            <template #icon><AppIcon icon="mdi-history" /></template>
            {{ t('viewAudit') }}
          </el-button>
        </template>
      </AppTable>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTable from '@/components/AppTable.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { formatTime } from '@/utils/format'
import { toolLabel, toolArgsSummary } from '@/utils/businessLabel'
import type { AiApprovalRequest } from '@/types/admin'

const { t, tm, locale } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const pending = ref<AiApprovalRequest[]>([])
const decided = ref<AiApprovalRequest[]>([])
const loading = ref(false)
const actingToken = ref('')

const statusMap = computed(() => ({ ok: t('aiApprovalStatusApproved'), cancelled: t('aiApprovalStatusDeclined') }))
const pendingHeaders = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'toolName', title: t('aiApprovalsTool') },
  { key: 'riskLevel', title: t('riskLevel') },
  { key: 'path', title: t('aiApprovalsPath') },
  { key: 'args', title: t('aiApprovalsArgs') },
  { key: 'createdAt', title: t('aiApprovalsCreated') },
  { key: 'actions', title: t('actionCol') },
])
const decidedHeaders = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'toolName', title: t('aiApprovalsTool') },
  { key: 'riskLevel', title: t('riskLevel') },
  { key: 'path', title: t('aiApprovalsPath') },
  { key: 'args', title: t('aiApprovalsArgs') },
  { key: 'status', title: t('aiApprovalsStatus') },
  { key: 'execution', title: t('aiApprovalsExecution') },
  { key: 'decidedAt', title: t('aiApprovalsDecidedAt') },
  { key: 'audit', title: t('actionCol') },
])

/**
 * P2：把执行态翻译成标签。非 approved 行（无执行维度）返回 null，让模板显示 '-' 而不是编一个状态。
 * 失败但无原因时（崩溃/挂起，未记录结果）也照常显示「执行未完成」——不假装知道原因。
 */
function executionTag(item: AiApprovalRequest) {
  switch (item.executionState) {
    case 'succeeded':
      return { label: t('aiApprovalsExecutionSucceeded'), type: 'success' as const }
    case 'failed':
      return { label: t('aiApprovalsExecutionFailed'), type: 'danger' as const }
    case 'running':
      return { label: t('aiApprovalsExecutionRunning'), type: 'warning' as const }
    case 'not_started':
      return { label: t('aiApprovalsExecutionNotStarted'), type: 'info' as const }
    default:
      return null
  }
}

/** 可重试 = 已批准且未成功（running 时不显示——服务端也会以 409 拒绝，避免与在途执行撞车） */
function canRetry(item: AiApprovalRequest) {
  return (
    item.status === 'approved' &&
    (item.executionState === 'failed' || item.executionState === 'not_started')
  )
}

async function onRetry(item: AiApprovalRequest) {
  actingToken.value = item.token
  try {
    const res = await aiToolsApi.retryApprovalExecution(item.token)
    snackbar.success(
      res.success ? t('aiApprovalsRetried') : `${t('aiApprovalsRetried')} — ${res.message ?? ''}`,
    )
    await loadAll()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    actingToken.value = ''
  }
}

async function loadAll() {
  loading.value = true
  try {
    const [p, d] = await Promise.all([aiToolsApi.approvals(), aiToolsApi.decidedApprovals()])
    pending.value = p
    decided.value = d
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

async function onDecide(item: AiApprovalRequest, decision: 'approve' | 'decline') {
  actingToken.value = item.token
  try {
    const res = await aiToolsApi.decideApproval(item.token, decision)
    snackbar.success(
      decision === 'approve'
        ? res.success
          ? t('aiApprovalsApproved')
          : `${t('aiApprovalsApproved')} — ${res.message ?? ''}`
        : t('aiApprovalsDeclined'),
    )
    await loadAll()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('aiApprovalsDecideFailed'))
  } finally {
    actingToken.value = ''
  }
}

onMounted(loadAll)
</script>

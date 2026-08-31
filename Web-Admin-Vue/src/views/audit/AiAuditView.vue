<template>
  <div>
    <PageHeader :title="t('aiAuditTitle')">
      <el-button @click="onExport">
        <template #icon><AppIcon icon="mdi-download" /></template>
        {{ t('export') }}
      </el-button>
    </PageHeader>

    <el-row :gutter="16" class="mb-2">
      <el-col v-for="s in statCards" :key="s.label" :xs="12" :md="6">
        <StatCard v-bind="s" />
      </el-col>
    </el-row>

    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center ga-2">
          <span>{{ t('hashChain') }}</span>
          <el-tag v-if="chainVerify" :type="chainVerify.valid ? 'success' : 'danger'" size="small">
            {{ chainVerify.valid ? t('chainValid') : t('chainBroken', { idx: chainVerify.brokenIndex ?? '-' }) }}
          </el-tag>
          <span v-if="chainVerify" class="text-secondary text-sm">{{ t('chainChecked', { n: chainVerify.checked }) }}</span>
        </div>
      </template>
      <div v-if="chainVerify?.chain?.length" class="chain-list">
        <div v-for="n in chainVerify.chain" :key="n.id" class="chain-node" :class="{ 'chain-broken': n.broken }">
          <span class="chain-id">#{{ n.id }}</span>
          <span class="chain-action">{{ n.action }}</span>
          <code class="chain-hash">{{ (n.prevHash || '—').slice(0, 10) }} → {{ (n.hash || '—').slice(0, 10) }}</code>
          <el-tag v-if="n.broken" type="danger" size="small">✗ {{ t('broken') }}</el-tag>
        </div>
      </div>
      <el-empty v-else-if="chainVerify" :description="t('noChainData')" />
    </el-card>

    <!-- E-2 按日趋势（5 段含 errors，纯 CSS 堆叠条） -->
    <el-card shadow="never" class="mb-4">
      <template #header>{{ t('auditTrendTitle') }}</template>
      <TrendBarList :days="stats?.byDay ?? []" />
    </el-card>

    <!-- E-2 异常概览：errors/blocked 计数 + 最近错误列表 -->
    <el-card shadow="never" class="mb-4">
      <template #header>{{ t('auditAbnormalTitle') }}</template>
      <div class="d-flex ga-6 mb-3">
        <div>
          <div class="text-h6 text-error">{{ abnormalCounts.errors }}</div>
          <div class="text-caption text-medium-emphasis">{{ t('secActionErrors') }}</div>
        </div>
        <div>
          <div class="text-h6">{{ abnormalCounts.blocked }}</div>
          <div class="text-caption text-medium-emphasis">{{ t('secActionBlocked') }}</div>
        </div>
      </div>
      <div class="text-caption text-medium-emphasis mb-1">{{ t('auditRecentErrors') }}</div>
      <div v-if="errorLogs.length" class="error-list">
        <div v-for="e in errorLogs" :key="e.id" class="error-item">
          <span class="text-caption font-weight-medium">{{ formatTime(e.createdAt) }}</span>
          <span class="error-msg text-caption">{{ errorLabel(e.errorMessage, t) || actionLabel(e) }}</span>
        </div>
      </div>
      <div v-else class="text-medium-emphasis">{{ t('secNoActionLog') }}</div>
    </el-card>

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <el-input v-model="userId" :label="t('filterByUser')" style="max-width: 200px" />
        <el-input v-model="agentId" :label="t('filterByAgent')" style="max-width: 200px" />
        <RangeFilter v-model="range" @update:model-value="onRange" />
        <el-button type="primary" @click="load">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="logs" :loading="loading" :total="logs.length" :items-per-page="limit" :hide-footer="true">
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.model="{ item }">{{ item.provider ? t('providerModel', { provider: item.provider, model: item.model || '-' }) : (item.model || '-') }}</template>
      <template #item.tokens="{ item }">{{ ((item.promptTokens ?? 0) + (item.completionTokens ?? 0)) || '-' }}</template>
      <template #item.action="{ item }">{{ actionLabel(item) }}</template>
      <template #item.isError="{ item }">
        <StatusChip :status="item.isError ? 'error' : 'ok'" :label-map="errorLabelMap" />
      </template>
      <template #item.expand="{ item }">
        <el-button text size="small" @click="toggleExpand(item.id)">
          <AppIcon icon="mdi-chevron-down" />
        </el-button>
      </template>
    </AppTable>

    <!-- §22.16 A-4 展开详情：L1 业务摘要 → L2 证据统计 → L3 技术详情 -->
    <el-card v-if="expanded" shadow="never" class="mt-2">
      <template #header>{{ t('statistics') }}</template>

      <!-- L1 业务语言摘要（审计解释器） -->
      <div v-if="interpretation" class="pa-2 mb-2" style="background: var(--el-fill-color-light); border-radius: 8px">
        <div class="text-body-2 font-weight-medium">{{ interpretation.summary.sentence }}</div>
        <el-tag v-if="interpretation.summary.businessEvent" size="small" effect="plain" class="mt-1">{{ interpretation.summary.businessEvent }}</el-tag>
      </div>

      <!-- L2 证据统计 -->
      <div v-if="interpretation?.stats && hasStats(interpretation.stats)" class="mb-2">
        <el-popover placement="top" :width="400" trigger="click" :teleported="false">
          <template #reference>
            <el-button text size="small" type="primary">{{ t('viewEvidence') }}</el-button>
          </template>
          <div class="pa-1">
            <div v-if="interpretation.stats.businessEvents.length" class="mb-2">
              <div class="text-caption font-weight-medium mb-1">{{ t('evidenceStats') }}</div>
              <div v-for="b in interpretation.stats.businessEvents" :key="b.event" class="d-flex justify-space-between align-center text-caption mb-1">
                <span>{{ b.event }}</span>
                <el-tag size="small">{{ b.count }}</el-tag>
              </div>
            </div>
            <div v-if="interpretation.stats.evidence.length" class="mb-2">
              <div class="text-caption font-weight-medium mb-1">{{ t('decisionEvidence') }}</div>
              <div v-for="(ev, i) in interpretation.stats.evidence" :key="i" class="mb-2 text-caption">
                <div>决策: <b>{{ ev.decision }}</b> · {{ t('confidence') }} {{ ev.confidence != null ? ev.confidence.toFixed(2) : '-' }}</div>
                <div v-for="(e, j) in ev.evidence" :key="j" class="text-medium-emphasis">· {{ e }}</div>
                <div v-if="ev.policy" class="text-medium-emphasis">{{ ev.policy }}</div>
              </div>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <el-tag v-if="interpretation.stats.confirmations.approved" type="success" size="small">{{ t('confirmedCount', { n: interpretation.stats.confirmations.approved }) }}</el-tag>
              <el-tag v-if="interpretation.stats.confirmations.declined" type="danger" size="small">{{ t('declinedCount', { n: interpretation.stats.confirmations.declined }) }}</el-tag>
              <el-tag v-if="interpretation.stats.blocked" type="warning" size="small">{{ t('blockedCount', { n: interpretation.stats.blocked }) }}</el-tag>
              <el-tag v-if="interpretation.stats.errors" size="small">{{ t('errorCount', { n: interpretation.stats.errors }) }}</el-tag>
            </div>
          </div>
        </el-popover>
      </div>

      <!-- L3 技术详情 -->
      <el-collapse>
        <el-collapse-item :title="t('technicalDetail')" name="tech">
          <div v-if="expanded.detail" class="d-flex ga-2 py-1">
            <span class="font-weight-medium" style="min-width: 140px">detail</span>
            <template v-if="detailParts(expanded.detail)">
              <span class="text-medium-emphasis">
                {{ toolLabel(feature, detailParts(expanded.detail)!.toolName) }}{{ toolArgsSummary(detailParts(expanded.detail)!.toolName, detailParts(expanded.detail)!.args, locale.startsWith('zh')) }}
              </span>
            </template>
            <span v-else class="text-medium-emphasis">{{ expanded.detail }}</span>
          </div>
          <div v-if="expanded.errorMessage" class="d-flex ga-2 py-1">
            <span class="font-weight-medium" style="min-width: 140px">errorMessage</span>
            <span class="text-medium-emphasis">{{ errorLabel(expanded.errorMessage, t) }}</span>
          </div>
          <div v-if="expanded.durationMs != null" class="d-flex ga-2 py-1">
            <span class="font-weight-medium" style="min-width: 140px">durationMs</span>
            <span class="text-medium-emphasis">{{ expanded.durationMs }} ms</span>
          </div>
          <div v-if="expanded.conversationId" class="d-flex ga-2 py-1">
            <span class="font-weight-medium" style="min-width: 140px">conversationId</span>
            <span class="text-medium-emphasis">{{ expanded.conversationId }}</span>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import StatCard from '@/components/StatCard.vue'
import RangeFilter from '@/components/RangeFilter.vue'
import StatusChip from '@/components/StatusChip.vue'
import TrendBarList from '@/components/TrendBarList.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import { toolLabel, toolArgsSummary, errorLabel } from '@/utils/businessLabel'
import type { AuditLog, UsageStats, ChainVerifyResult, AuditInterpretation } from '@/types/audit'

const { t, messages, locale } = useI18n()
const feature = computed(() => (messages.value[String(locale.value)] as { feature?: Record<string, string> } | undefined)?.feature)
const route = useRoute()
const snackbar = useSnackbarStore()

const logs = ref<AuditLog[]>([])
const stats = ref<UsageStats | null>(null)
const chainVerify = ref<ChainVerifyResult | null>(null)
const loading = ref(false)
const userId = ref('')
const agentId = ref('')
const range = ref('all')
const since = ref<string | undefined>(undefined)
const expanded = ref<AuditLog | null>(null)
const errorLogs = ref<AuditLog[]>([])
const limit = 50

const headers = computed(() => [
  { key: 'createdAt', title: t('timeCol') },
  { key: 'username', title: t('userCol') },
  { key: 'agentId', title: t('agentCol') },
  { key: 'action', title: t('featureCol') },
  { key: 'model', title: t('modelCol') },
  { key: 'tokens', title: t('tokenCol') },
  { key: 'isError', title: t('statusCol') },
  { key: 'expand', title: '' },
])

const errorLabelMap = computed(() => ({ ok: t('ok'), error: t('error') }))

const statCards = computed(() => [
  { label: t('conversations'), value: stats.value?.totalConversations ?? '-', icon: 'mdi-forum-outline', color: 'primary' },
  { label: t('messages'), value: stats.value?.totalMessages ?? '-', icon: 'mdi-message-outline', color: 'success' },
  { label: t('totalTokens'), value: stats.value?.totalTokens ?? '-', icon: 'mdi-database-outline', color: 'warning' },
  { label: t('errors'), value: stats.value?.totalErrors ?? '-', icon: 'mdi-alert-circle-outline', color: 'error' },
])

/** E-2 异常概览：按日桶求和 errors/blocked 计数 */
const abnormalCounts = computed(() => {
  const days = stats.value?.byDay ?? []
  let errors = 0
  let blocked = 0
  for (const d of days) {
    errors += d.errors
    blocked += d.blocked
  }
  return { errors, blocked }
})

async function load() {
  loading.value = true
  try {
    const [logsRes, statsRes, verifyRes, errRes] = await Promise.all([
      auditApi.logs({ userId: userId.value || undefined, agentId: agentId.value || undefined, limit, since: since.value }),
      auditApi.stats(since.value),
      auditApi.verify().catch(() => null),
      auditApi.logs({ isError: 'true', limit: 5, since: since.value }).catch(() => [] as AuditLog[]),
    ])
    logs.value = logsRes
    stats.value = statsRes
    chainVerify.value = verifyRes
    errorLogs.value = errRes
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function onRange(key: string, s?: string) {
  range.value = key
  since.value = s
}
function toggleExpand(id: number) {
  const log = logs.value.find((l) => l.id === id)
  const isSame = expanded.value?.id === id
  expanded.value = isSame ? null : (log ?? null)
  interpretation.value = null
  if (!isSame && log) {
    auditApi.interpretation(id).then((r) => { interpretation.value = r }).catch(() => { interpretation.value = null })
  }
}

/** §22.16 A-4 审计解释器：展开行的业务摘要 + 证据统计 */
const interpretation = ref<AuditInterpretation | null>(null)

function hasStats(s: AuditInterpretation['stats']): boolean {
  return s.businessEvents.length > 0 || s.evidence.length > 0 || s.confirmations.approved > 0 || s.confirmations.declined > 0 || s.blocked > 0 || s.errors > 0
}

/** D2 人类语言审计标签：actionKey 查 i18n feature 容器（与操作审计 feature-map 同源），fallback 到后端 actionLabel/原始 action */
function actionLabel(log: AuditLog): string {
  if (log.actionKey) {
    const msg = messages.value[String(locale.value)] as { feature?: Record<string, string> } | undefined
    const localized = msg?.feature?.[log.actionKey]
    if (localized) return localized
  }
  return log.actionLabel || log.action || '-'
}

/** 解析工具调用 detail（形如 create_followup_task({"title":...})）→ 工具名 + 参数；非工具调用返回 null */
function detailParts(detail: string | null | undefined): { toolName: string; args: string } | null {
  const m = /^([\w]+)\((.*)\)$/s.exec(detail || '')
  return m ? { toolName: m[1], args: m[2] } : null
}

function onExport() {
  downloadCsv(
    'ai-audit',
    [t('timeCol'), t('userCol'), t('featureCol'), t('modelCol'), t('tokenCol'), t('statusCol')],
    logs.value.map((l) => [
      formatTime(l.createdAt),
      l.username || l.userId || '',
      actionLabel(l),
      l.provider ? `${l.provider}/${l.model}` : (l.model || ''),
      (l.promptTokens ?? 0) + (l.completionTokens ?? 0),
      l.isError ? t('error') : t('ok'),
    ]),
  )
  snackbar.success(t('exportDone'))
}

onMounted(() => {
  const q = route.query.agentId
  if (typeof q === 'string' && q) agentId.value = q
  load()
})
</script>

<style scoped>
.chain-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
}
.chain-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
}
.chain-node.chain-broken {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
.chain-id { font-weight: 600; min-width: 36px; }
.chain-action { flex: 1; }
.chain-hash { font-family: monospace; color: var(--el-text-color-secondary); }
.error-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.error-item {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.error-msg {
  color: var(--el-color-danger);
  word-break: break-all;
}
</style>

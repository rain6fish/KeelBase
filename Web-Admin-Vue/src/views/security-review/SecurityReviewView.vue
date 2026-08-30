<template>
  <div>
    <PageHeader :title="t('navSecurityReview')" :subtitle="t('secReviewHint')" />

    <el-tabs v-model="tab">
      <!-- Trace：按对话查看执行轨迹（复用工作台 AiTraceView） -->
      <el-tab-pane :label="t('secTabTrace')" name="trace">
        <AiTraceView />
      </el-tab-pane>

      <!-- Review："是否安全"判断——风险操作 + 结构化拒绝 + 副作用 -->
      <el-tab-pane :label="t('secTabReview')" name="review">
        <!-- B1：管理员按用户反查权限决策依据（为何允许/为何阻止） -->
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex justify-space-between align-center">
              <span>{{ t('secUserDiag') }}</span>
              <span class="text-caption text-medium-emphasis">{{ t('secUserDiagHint') }}</span>
            </div>
          </template>
          <div class="d-flex flex-wrap ga-3 align-center">
            <el-select v-model="diagUserId" filterable clearable :placeholder="t('secUserDiagPick')" style="width: 200px" @update:model-value="onDiagUserChange">
              <el-option v-for="u in diagUsers" :key="u.id" :label="u.username" :value="u.id" />
            </el-select>
            <el-select v-model="diagAction" style="width: 120px">
              <el-option v-for="a in ACTIONS" :key="a" :label="a" :value="a" />
            </el-select>
            <el-input v-model="diagSubject" style="width: 180px" placeholder="subject" />
            <el-button type="primary" size="small" :loading="diagLoading" @click="runDiag">
              {{ t('secUserDiagRun') }}
            </el-button>
          </div>
          <div v-if="diagResult" class="mt-3">
            <el-alert :type="diagResult.allowed ? 'success' : 'error'" :closable="false" :title="`${diagResult.action} ${diagResult.subject}`" show-icon>
              <div class="text-body-2 mt-1">
                <StatusChip :status="diagResult.allowed ? 'ok' : 'cancelled'" :label-map="{ ok: t('secUserDiagAllowed'), cancelled: t('secUserDiagDenied') }" />
                <span class="ms-2">{{ diagResult.reason }}</span>
                <span v-if="!diagResult.allowed && diagResult.deniedBy" class="text-caption text-medium-emphasis ms-2">deniedBy: {{ diagResult.deniedBy }}</span>
              </div>
            </el-alert>
          </div>
        </el-card>

        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex justify-space-between align-center">
              <span>{{ t('secReviewRiskOps') }}</span>
              <el-button size="small" @click="loadReview()">
                <template #icon><AppIcon icon="mdi-refresh" /></template>
                {{ t('refresh') }}
              </el-button>
            </div>
          </template>
          <AppTable :headers="reviewHeaders" :items="riskLogs" :loading="loading">
            <template #item.detail="{ item }">
              <span class="text-caption">{{ item.detail }}</span>
            </template>
            <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
            <template #item.reason="{ item }">
              <div v-if="parseChecks(item.authorization)?.length">
                <div v-for="c in parseChecks(item.authorization)" :key="c.name" class="d-flex align-center ga-1 text-body-2">
                  <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="15" />
                  <span class="text-caption" :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
                </div>
              </div>
              <span v-else class="text-medium-emphasis">{{ t('secNoChecks') }}</span>
            </template>
          </AppTable>
          <div v-if="!loading && riskLogs.length === 0" class="text-medium-emphasis pa-3">{{ t('secNoRiskOps') }}</div>
        </el-card>
      </el-tab-pane>

      <!-- Security：安全姿态——工具风险分布 + 评测证据 -->
      <el-tab-pane :label="t('secTabSecurity')" name="security">
        <el-row :gutter="16">
          <el-col :md="12" :xs="24">
            <el-card shadow="never" class="mb-4">
              <template #header>{{ t('secToolRiskDist') }}</template>
              <div v-if="byRisk.length">
                <div v-for="r in byRisk" :key="r.level" class="d-flex justify-space-between align-center pa-1">
                  <span>{{ r.level }} · {{ riskLabel(r.level) }}</span>
                  <el-tag size="small" :type="riskTagType(r.level)" effect="light">{{ r.count }}</el-tag>
                </div>
              </div>
              <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
            </el-card>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-card shadow="never">
              <template #header>{{ t('secEvalReport') }}</template>
              <div v-if="evalReport">
                <div class="d-flex ga-2 mb-2">
                  <el-tag :type="evalReport.passed >= evalReport.total ? 'success' : 'danger'" effect="light">
                    {{ evalReport.passed }}/{{ evalReport.total }}
                  </el-tag>
                  <span class="text-body-2 text-medium-emphasis">{{ t('secEvalRate') }} {{ evalRate }}%</span>
                </div>
                <div v-if="evalReport.failed > 0" class="text-error text-body-2">{{ t('secEvalFailed') }} {{ evalReport.failed }}</div>
              </div>
              <div v-else class="text-medium-emphasis">{{ t('secNoEval') }}</div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- Action Report：合规证据包——执行/批准/拒绝/阻断 + 副作用 + 哈希链 -->
      <el-tab-pane :label="t('secTabActionReport')" name="action-report">
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex justify-space-between align-center">
              <span>{{ t('secActionReportHint') }}</span>
              <div class="d-flex align-center ga-2">
                <el-button size="small" type="primary" @click="exportEvidencePackage">
                  <template #icon><AppIcon icon="mdi-download" /></template>
                  {{ t('secExportEvidence') }}
                </el-button>
                <el-button size="small" @click="loadActionReport()">
                  <template #icon><AppIcon icon="mdi-refresh" /></template>
                  {{ t('refresh') }}
                </el-button>
              </div>
            </div>
          </template>
          <div v-if="actionReport" class="d-flex flex-wrap ga-3 mb-3">
            <el-card shadow="never" class="flex-1" style="min-width: 120px">
              <div class="text-h6">{{ actionReport.summary.executed }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('secActionExecuted') }}</div>
            </el-card>
            <el-card shadow="never" class="flex-1" style="min-width: 120px">
              <div class="text-h6">{{ actionReport.summary.approved }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('secActionApproved') }}</div>
            </el-card>
            <el-card shadow="never" class="flex-1" style="min-width: 120px">
              <div class="text-h6">{{ actionReport.summary.rejected }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('secActionRejected') }}</div>
            </el-card>
            <el-card shadow="never" class="flex-1" style="min-width: 120px">
              <div class="text-h6 text-error">{{ actionReport.summary.blocked }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('secActionBlocked') }}</div>
            </el-card>
            <el-card shadow="never" class="flex-1" style="min-width: 120px">
              <div class="text-h6">{{ actionReport.summary.effects }}</div>
              <div class="text-caption text-medium-emphasis">{{ t('secActionEffects') }}</div>
            </el-card>
            <el-card shadow="never" class="flex-1" style="min-width: 160px">
              <div class="d-flex align-center ga-1">
                <StatusChip
                  :status="actionReport.hashChain.valid ? 'ok' : 'cancelled'"
                  :label-map="{ ok: t('secChainValid'), cancelled: `${t('secChainBroken')} @${actionReport.hashChain.brokenIndex ?? '?'}` }"
                />
              </div>
              <div class="text-caption text-medium-emphasis mt-1">{{ t('secActionChain') }} ({{ actionReport.hashChain.checked }})</div>
            </el-card>
          </div>
          <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
        </el-card>

        <!-- E-2 审计哈希链明细：可展开的逐行链可视化（verify 返回链切片） -->
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex justify-space-between align-center">
              <span>{{ t('hashChainTitle') }}</span>
              <el-button v-if="verify?.chain?.length" text size="small" @click="showChain = !showChain">
                {{ showChain ? t('collapse') : t('expand') }}
              </el-button>
            </div>
          </template>
          <HashChainView
            v-if="showChain && verify"
            :chain="verify.chain ?? []"
            :valid="verify.valid"
            :checked="verify.checked"
            :broken-index="verify.brokenIndex ?? null"
          />
          <div v-else class="text-medium-emphasis text-caption">{{ t('hashChainHint') }}</div>
        </el-card>

        <!-- B3/E-2 时间趋势：按日 5 段堆叠条（无图表库，纯 CSS；含 errors 段） -->
        <el-card shadow="never" class="mb-4">
          <template #header>{{ t('secTrendTitle') }}</template>
          <TrendBarList :days="actionReport?.byDay ?? []" />
        </el-card>

        <el-card shadow="never" class="mb-4">
          <template #header>{{ t('secActionByType') }}</template>
          <div v-if="actionReport?.byAction.length">
            <div v-for="a in actionReport.byAction" :key="a.action" class="d-flex justify-space-between align-center pa-1">
              <span class="text-body-2">{{ a.action }}</span>
              <el-tag size="small" effect="plain">{{ a.count }}</el-tag>
            </div>
          </div>
          <div v-else class="text-medium-emphasis">{{ t('secNoActionLog') }}</div>
        </el-card>

        <el-card shadow="never">
          <template #header>{{ t('secActionSamples') }}</template>
          <AppTable :headers="sampleHeaders" :items="actionReport?.samples ?? []" :loading="loading">
            <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
            <template #item.errorMessage="{ item }">
              <span class="text-caption text-error">{{ item.errorMessage || '-' }}</span>
            </template>
          </AppTable>
          <div v-if="!loading && !actionReport?.samples.length" class="text-medium-emphasis pa-3">{{ t('secNoActionLog') }}</div>
        </el-card>
      </el-tab-pane>

      <!-- Posture：整体态势——治理策略 + 审计链完整性 -->
      <el-tab-pane :label="t('secTabPosture')" name="posture">
        <el-row :gutter="16">
          <el-col :md="12" :xs="24">
            <el-card shadow="never" class="mb-4">
              <template #header>{{ t('secGovernancePolicy') }}</template>
              <div v-if="policy">
                <div class="text-caption text-medium-emphasis mb-2">{{ t('secPolicyHint') }}</div>
                <pre class="text-caption" style="max-height: 320px; overflow: auto">{{ policy }}</pre>
              </div>
              <div v-else class="text-medium-emphasis">{{ t('secNoPolicy') }}</div>
            </el-card>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-card shadow="never">
              <template #header>{{ t('secAuditChain') }}</template>
              <HashChainView
                v-if="verify"
                :chain="verify.chain ?? []"
                :valid="verify.valid"
                :checked="verify.checked"
                :broken-index="verify.brokenIndex ?? null"
              />
              <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTable from '@/components/AppTable.vue'
import StatusChip from '@/components/StatusChip.vue'
import HashChainView from '@/components/HashChainView.vue'
import TrendBarList from '@/components/TrendBarList.vue'
import AiTraceView from '@/views/workbench/AiTraceView.vue'
import { ElMessage } from 'element-plus'
import { auditApi } from '@/api/audit'
import { aiToolsApi } from '@/api/aiTools'
import { aiEvalApi } from '@/api/aiEval'
import { usersApi } from '@/api/users'
import { authApi } from '@/api/auth'
import { formatTime } from '@/utils/format'
import type { AuditLog, ActionReport, ChainVerifyResult } from '@/types/audit'
import type { AdminAiTool } from '@/types/admin'
import type { EvalRunReport } from '@/types/eval'

const { t } = useI18n()

const tab = ref('trace')
const loading = ref(false)

// ── Review tab ──
const riskLogs = ref<AuditLog[]>([])
const reviewHeaders = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'username', title: t('userCol') },
  { key: 'action', title: t('actionCol') },
  { key: 'detail', title: t('detailCol') },
  { key: 'reason', title: t('secWhyBlocked') },
  { key: 'createdAt', title: t('createdAt') },
])

/** W5-⑦：authorization 列是 checks[] JSON，解析为数组供渲染 */
function parseChecks(raw?: string | null): Array<{ name: string; ok: boolean; note?: string }> | undefined {
  if (!raw) return undefined
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : undefined
  } catch {
    return undefined
  }
}

async function loadReview() {
  loading.value = true
  try {
    const logs = await auditApi.logs({ limit: 50, ...(diagUserId.value ? { userId: String(diagUserId.value) } : {}) })
    // 风险操作：isError 或带结构化拒绝原因（authorization）
    riskLogs.value = logs.filter((l) => l.isError || !!l.authorization)
  } catch {
    riskLogs.value = []
  } finally {
    loading.value = false
  }
}

// ── B1：按用户反查权限决策依据 + 该用户风险操作时间线 ──
const ACTIONS = ['manage', 'create', 'read', 'update', 'delete']
const diagUsers = ref<Array<{ id: number; username: string }>>([])
const diagUserId = ref<number | null>(null)
const diagAction = ref('manage')
const diagSubject = ref('CrmCustomer')
const diagResult = ref<{ action: string; subject: string; allowed: boolean; reason: string; deniedBy: string | null } | null>(null)
const diagLoading = ref(false)

async function loadDiagUsers() {
  try {
    const res = await usersApi.list(1, 100)
    diagUsers.value = res.items.map((u) => ({ id: u.id, username: u.username }))
  } catch {
    diagUsers.value = []
  }
}

async function onDiagUserChange() {
  diagResult.value = null
  await loadReview()
}

async function runDiag() {
  if (!diagUserId.value) return
  diagLoading.value = true
  try {
    diagResult.value = await authApi.explainTarget(diagUserId.value, diagAction.value, diagSubject.value)
  } catch {
    diagResult.value = null
  } finally {
    diagLoading.value = false
  }
}

// ── Security tab ──
const tools = ref<AdminAiTool[]>([])
const evalReport = ref<EvalRunReport | null>(null)

const RISK_ORDER = ['R5', 'R4', 'R3', 'R2', 'R1', 'R0']
const byRisk = computed(() => {
  const m: Record<string, number> = {}
  for (const tl of tools.value) {
    const lv = tl.riskLevel || 'R1'
    m[lv] = (m[lv] ?? 0) + 1
  }
  return RISK_ORDER.filter((lv) => m[lv] != null).map((lv) => ({ level: lv, count: m[lv] }))
})
const evalRate = computed(() => {
  if (!evalReport.value || evalReport.value.total === 0) return 0
  return Math.round((100 * evalReport.value.passed) / evalReport.value.total)
})

function riskLabel(lv: string): string {
  if (lv === 'R5') return t('riskBlocked')
  if (lv === 'R4') return t('riskApproval')
  if (lv === 'R3') return t('riskConfirm')
  return t('riskAuto')
}
function riskTagType(lv: string): 'danger' | 'warning' | 'success' {
  if (lv === 'R5') return 'danger'
  if (lv === 'R4' || lv === 'R3') return 'warning'
  return 'success'
}

async function loadSecurity() {
  try {
    const [toolList, report] = await Promise.all([aiToolsApi.tools(), aiEvalApi.report()])
    tools.value = toolList
    evalReport.value = report
  } catch {
    tools.value = []
    evalReport.value = null
  }
}

// ── Posture tab ──
const policy = ref<string | undefined>(undefined)
const verify = ref<ChainVerifyResult | null>(null)
const showChain = ref(false)

async function loadPosture() {
  try {
    const [p, v] = await Promise.all([aiToolsApi.policy(), auditApi.verify()])
    policy.value = p
    verify.value = v
  } catch {
    policy.value = undefined
    verify.value = null
  }
}

// ── Action Report tab（§10 P1 合规证据包）──
const actionReport = ref<ActionReport | null>(null)

const sampleHeaders = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'toolName', title: t('secActionTool') },
  { key: 'action', title: t('secActionType') },
  { key: 'createdAt', title: t('timeCol') },
  { key: 'errorMessage', title: t('secActionReason') },
])

async function loadActionReport() {
  try {
    actionReport.value = await auditApi.actionReport({ limit: 10 })
  } catch {
    actionReport.value = null
  }
}

/** D4 审计证据包导出：下载含哈希链校验 + 时间戳 + 签名的 JSON 证据包（可提交审计机构） */
async function exportEvidencePackage() {
  try {
    const pkg = await auditApi.exportActionReport({ limit: 10 })
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `keelbase-evidence-${pkg.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('exportDone'))
  } catch {
    ElMessage.error(t('loadFailed'))
  }
}

onMounted(() => {
  loadReview()
  loadSecurity()
  loadPosture()
  loadActionReport()
  loadDiagUsers()
})
</script>

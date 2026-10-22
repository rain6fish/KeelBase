<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('aiAuditTitle')">
      <el-button @click="onExport">
        <template #icon><AppIcon icon="mdi-download" /></template>
        {{ t('export') }}
      </el-button>
    </PageHeader>

    <!-- AW-3 覆盖声明（**先声明、再读数**）：这个口径读了什么、以及这么读**看不了**什么。
         每一条都来自后端缺口登记表（`governance-core/coverage-gaps.ts`），故往那里加一条，这里自动多一条
         —— 前端没有任何会漂开的清单。
         AW-3 coverage statement, placed before the numbers: what this window was read from, and what
         reading it cannot show. Every line comes from the backend registry, so a new gap shows up here
         with no frontend change. -->
    <el-alert
      v-if="coverage"
      :type="coverage.verdict === 'complete' ? 'success' : coverage.verdict === 'partial' ? 'warning' : 'info'"
      :closable="false"
      show-icon
      class="mb-4"
    >
      <template #title>{{ t('coverageTitle') }} · {{ t(`coverageVerdict_${coverage.verdict}`) }}</template>
      <div class="text-caption mb-1">
        {{ t('coverageSources') }}：{{
          coverage.sources.map((s) => `${s.id}=${s.state}${s.rows == null ? '' : `(${s.rows})`}`).join(' · ')
        }}
      </div>
      <div v-if="coverage.gaps.length">
        <div v-for="g in coverage.gaps" :key="g.id" class="coverage-row">
          <el-tag
            :type="g.severity === 'high' ? 'danger' : g.severity === 'medium' ? 'warning' : 'info'"
            size="small"
          >
            {{ g.severity }}
          </el-tag>
          <span>{{ gapLabel(g) }}</span>
        </div>
      </div>
      <div v-else class="text-caption">{{ t('coverageNoGaps') }}</div>
      <div class="text-caption text-medium-emphasis mt-1">
        {{ t('coverageRegistry', { rev: coverage.registryRevision }) }}
      </div>
    </el-alert>
    <!-- 取不到就**说出来**：一句取不到的告诫，会被读成「这里没问题」，而那正是本特性要防的事。 -->
    <el-alert
      v-else-if="coverageLoaded"
      type="warning"
      :closable="false"
      show-icon
      class="mb-4"
      :title="t('coverageUnavailable')"
    />

    <el-row :gutter="16" class="mb-2">
      <el-col v-for="s in statCards" :key="s.label" :xs="12" :md="6">
        <StatCard v-bind="s" />
      </el-col>
    </el-row>

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
          <span class="error-msg text-caption">{{ errorSummary(e) }}</span>
        </div>
      </div>
      <div v-else class="text-medium-emphasis">{{ t('secNoActionLog') }}</div>
    </el-card>

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <el-input v-model="userId" :label="t('filterByUser')" style="max-width: 200px" />
        <el-input v-model="agentId" :label="t('filterByAgent')" style="max-width: 200px" />
        <RangeFilter v-model="range" @update:model-value="onRange" />
        <el-select v-model="behaviorFilter" :placeholder="t('filterBehavior')" clearable style="width: 170px">
          <el-option :label="t('behaviorExecute')" value="execute" />
          <el-option :label="t('behaviorFailed')" value="failed" />
          <el-option :label="t('behaviorDenied')" value="denied" />
          <el-option :label="t('behaviorChat')" value="chat" />
        </el-select>
        <el-button type="primary" @click="load">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="filteredLogs" :loading="loading" :total="filteredLogs.length" :items-per-page="limit" :hide-footer="true">
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

    <!-- §internal.16 A-4 展开详情：L1 业务摘要 → L2 证据统计 → L3 技术详情 -->
    <el-card v-if="expanded" shadow="never" class="mt-2">
      <template #header>{{ t('actionExplanation') }}</template>

      <!-- L1 业务语言摘要（审计解释器） -->
      <div v-if="interpretation" class="pa-2 mb-2" style="background: var(--el-fill-color-light); border-radius: 8px">
        <div class="text-body-2 font-weight-medium">{{ interpretation.summary.sentence }}</div>
        <el-tag v-if="interpretation.summary.businessEvent" size="small" effect="plain" class="mt-1">{{ interpretation.summary.businessEvent }}</el-tag>
      </div>

      <!-- L2 证据统计 -->
      <div v-if="interpretation?.summary.stats && hasStats(interpretation.summary.stats)" class="mb-2">
        <el-popover placement="top" :width="400" trigger="click" :teleported="false">
          <template #reference>
            <el-button text size="small" type="primary">{{ t('viewEvidence') }}</el-button>
          </template>
          <div class="pa-1">
            <div v-if="interpretation.summary.stats.businessEvents.length" class="mb-2">
              <div class="text-caption font-weight-medium mb-1">{{ t('evidenceStats') }}</div>
              <div v-for="b in interpretation.summary.stats.businessEvents" :key="b.event" class="d-flex justify-space-between align-center text-caption mb-1">
                <span>{{ b.event }}</span>
                <el-tag size="small">{{ b.count }}</el-tag>
              </div>
            </div>
            <div v-if="interpretation.summary.stats.evidence.length" class="mb-2">
              <div class="text-caption font-weight-medium mb-1">{{ t('decisionEvidence') }}</div>
              <div v-for="(ev, i) in interpretation.summary.stats.evidence" :key="i" class="mb-2 text-caption">
                <div>决策: <b>{{ ev.decision }}</b> · {{ t('confidence') }} {{ ev.confidence != null ? ev.confidence.toFixed(2) : '-' }}</div>
                <div v-for="(e, j) in ev.evidence" :key="j" class="text-medium-emphasis">· {{ e }}</div>
                <div v-if="ev.policy" class="text-medium-emphasis">{{ ev.policy }}</div>
              </div>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <el-tag v-if="interpretation.summary.stats.confirmations.approved" type="success" size="small">{{ t('confirmedCount', { n: interpretation.summary.stats.confirmations.approved }) }}</el-tag>
              <el-tag v-if="interpretation.summary.stats.confirmations.declined" type="danger" size="small">{{ t('declinedCount', { n: interpretation.summary.stats.confirmations.declined }) }}</el-tag>
              <el-tag v-if="interpretation.summary.stats.blocked" type="warning" size="small">{{ t('blockedCount', { n: interpretation.summary.stats.blocked }) }}</el-tag>
              <el-tag v-if="interpretation.summary.stats.errors" size="small">{{ t('errorCount', { n: interpretation.summary.stats.errors }) }}</el-tag>
            </div>
          </div>
        </el-popover>
      </div>

      <!-- P0-20 单事件解释面：一次 AI 动作 → **一条时间线**。
           六问各占一项：谁做的／做了什么 · 为什么允许 · 谁批准 · 业务副作用 · 业务那一腿 · 结果与如何证明。
           前两项原先各自成块，内容**原样**搬进时间线，没有重写。 -->
      <el-timeline class="pa-0">
        <el-timeline-item v-if="identityChain" type="primary" :hollow="true">
          <div class="text-caption font-weight-medium mb-1">{{ t('explanationStepWho') }}</div>
          <div class="d-flex align-center ga-1 flex-wrap">
            <el-tag size="small" effect="plain">{{ identityChain.human.username || identityChain.human.userId }}</el-tag>
            <el-tag v-if="identityChain.agent.agentId" size="small" type="warning" effect="plain">
              {{ identityChain.agent.agentName || identityChain.agent.agentId }}{{ identityChain.agent.trustLevel ? ` (${identityChain.agent.trustLevel})` : '' }}
            </el-tag>
            <el-tag v-if="identityChain.tool.toolName" size="small" type="primary" effect="plain">{{ toolLabel(feature, identityChain.tool.toolName) }}</el-tag>
            <el-tag v-if="identityChain.action.businessEvent" size="small" type="success" effect="plain">{{ identityChain.action.businessEvent }}</el-tag>
            <el-tag v-if="identityChain.source" size="small" effect="dark" class="ms-1">{{ identityChain.source }}</el-tag>
          </div>
        </el-timeline-item>

        <el-timeline-item
          v-if="identityChain?.authorization.denied || identityChain?.authorization.allowed"
          type="warning"
          :hollow="true"
        >
          <div class="text-caption font-weight-medium mb-1">{{ t('explanationStepWhy') }}</div>
          <div v-if="identityChain.authorization.denied" class="mt-1">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('deniedReason') }}</div>
            <div v-for="c in identityChain.authorization.denied" :key="c.name" class="d-flex align-center ga-1 text-body-2">
              <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="14" />
              <span class="text-caption" :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
            </div>
          </div>
          <div v-else-if="identityChain.authorization.allowed" class="mt-1">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('authorizedBy') }}</div>
            <div v-for="c in identityChain.authorization.allowed.checks as Array<{name:string;ok:boolean;note?:string}>" :key="c.name" class="d-flex align-center ga-1 text-body-2">
              <AppIcon icon="mdi-check-circle" color="var(--el-color-success)" size="14" />
              <span class="text-caption">{{ c.note || c.name }}</span>
            </div>
          </div>
        </el-timeline-item>

        <!-- 谁批准：经占位行的 token 找到的确认记录；没有确认动作就没有这一项（不按会话猜） -->
        <el-timeline-item v-if="interpretation?.approval" type="success" :hollow="true">
          <div class="text-caption font-weight-medium mb-1">{{ t('explanationStepApproval') }}</div>
          <div class="d-flex align-center ga-2 flex-wrap text-caption">
            <el-tag size="small" effect="plain">{{ toolLabel(feature, interpretation.approval.toolName) }}</el-tag>
            <el-tag size="small">{{ interpretation.approval.status }}</el-tag>
            <span>{{ interpretation.approval.riskLevel }}</span>
            <span v-if="interpretation.approval.approverId" class="text-medium-emphasis">
              {{ t('approverCol') }}: {{ interpretation.approval.approverId }}
            </span>
            <span v-if="interpretation.approval.decidedAt" class="text-medium-emphasis">
              {{ formatTime(interpretation.approval.decidedAt) }}
            </span>
          </div>
        </el-timeline-item>

        <!-- 业务副作用：它改了什么、以及撤销到了哪一档 -->
        <el-timeline-item v-if="interpretation?.effect" type="primary" :hollow="true">
          <div class="text-caption font-weight-medium mb-1">{{ t('explanationStepEffect') }}</div>
          <div class="text-caption text-medium-emphasis mb-1">
            {{ toolLabel(feature, interpretation.effect.toolName) }} →
            {{ interpretation.effect.resultType }}:{{ interpretation.effect.resultId }}
            <template v-if="interpretation.effect.revokeStatus">
              · {{ t('revokeStatusCol') }}: {{ revokeStatusLabel(interpretation.effect.revokeStatus) }}
            </template>
            <template v-if="interpretation.effect.revokeWindow">
              · {{ revokeWindowLabel(interpretation.effect.revokeWindow) }}
            </template>
          </div>
          <FieldDiff :before="interpretation.effect.before" :after="interpretation.effect.after" />
        </el-timeline-item>

        <!-- 业务那一腿：这次动作引起的操作审计行（与 AI 审计是两条链） -->
        <el-timeline-item v-if="interpretation?.operationAudit.length" type="info" :hollow="true">
          <div class="text-caption font-weight-medium mb-1">{{ t('explanationStepBusinessLeg') }}</div>
          <div v-for="r in interpretation.operationAudit" :key="r.id" class="text-caption text-medium-emphasis">
            #{{ r.id }}<template v-if="opPath(r.payload)"> · {{ opPath(r.payload) }}</template>
          </div>
        </el-timeline-item>

        <!-- 结果与如何证明：**一个**状态 + 这条记录自己的链位 -->
        <el-timeline-item v-if="interpretation" type="success" :hollow="true">
          <div class="text-caption font-weight-medium mb-1">{{ t('explanationStepResult') }}</div>
          <div class="d-flex align-center ga-2 flex-wrap">
            <StatusChip
              :status="interpretation.state"
              :label-map="explanationStateLabels"
              :color-map="explanationStateColors"
            />
          </div>
        </el-timeline-item>
      </el-timeline>

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
            <!-- AU-4（§22.19）：一跳看该次对话——先引用（元数据），正文须在抽屉内**显式**再点 -->
            <el-button link type="primary" size="small" @click="openConversation(expanded.conversationId)">
              {{ expanded.conversationId }}
            </el-button>
          </div>
          <!-- AU-3（§22.19 归因层）：访客标识——共享演示账号（alex）下区分不同访客 -->
          <div v-if="expanded.guestId" class="d-flex ga-2 py-1">
            <span class="font-weight-medium" style="min-width: 140px">{{ t('guestCol') }}</span>
            <span class="text-medium-emphasis">{{ expanded.guestId }}</span>
          </div>
          <!-- The row's chain position is evidence, not summary: it lives here with the other
               technical fields rather than beside the business outcome. -->
          <div v-if="interpretation?.row?.hash" class="d-flex ga-2 py-1">
            <span class="font-weight-medium" style="min-width: 140px">hash</span>
            <code class="text-caption text-medium-emphasis">{{ interpretation.row.hash }}</code>
          </div>
          <div v-if="interpretation?.row?.prevHash" class="d-flex ga-2 py-1">
            <span class="font-weight-medium" style="min-width: 140px">prevHash</span>
            <code class="text-caption text-medium-emphasis">{{ interpretation.row.prevHash }}</code>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- E-2 hash-chain evidence. The verdict is business-level and stays in the header; the per-row
         `prev → hash` nodes are technical evidence, so they sit behind an explicit expand and start
         collapsed. The reader meets the audit summary first, not the chain.

         E-2 哈希链证据。结论是业务层面的，留在卡片头；逐行 `prev → hash` 是技术证据，故放在显式展开
         之后，默认收起。读者先看到审计摘要，而不是哈希链。 -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center ga-2">
          <span>{{ t('hashChain') }}</span>
          <el-tag v-if="chainVerify" :type="chainVerify.valid ? 'success' : 'danger'" size="small">
            {{ chainVerify.valid ? t('chainValid') : t('chainBroken', { idx: chainVerify.brokenIndex ?? '-' }) }}
          </el-tag>
          <span v-if="chainVerify" class="text-secondary text-sm">{{ t('chainChecked', { n: chainVerify.checked }) }}</span>
          <el-button
            v-if="chainVerify?.chain?.length"
            text
            size="small"
            class="ms-auto"
            @click="showChain = !showChain"
          >
            {{ showChain ? t('collapse') : t('expand') }}
          </el-button>
        </div>
      </template>
      <div v-if="showChain && chainVerify?.chain?.length" class="chain-list">
        <div v-for="n in chainVerify.chain" :key="n.id" class="chain-node" :class="{ 'chain-broken': n.broken }">
          <span class="chain-id">#{{ n.id }}</span>
          <span class="chain-action">{{ n.action }}</span>
          <code class="chain-hash">{{ (n.prevHash || '—').slice(0, 10) }} → {{ (n.hash || '—').slice(0, 10) }}</code>
          <el-tag v-if="n.broken" type="danger" size="small">✗ {{ t('broken') }}</el-tag>
        </div>
      </div>
      <div v-else-if="chainVerify" class="text-caption text-medium-emphasis">
        {{ chainVerify.chain?.length ? t('hashChainHint') : t('noChainData') }}
      </div>
    </el-card>

    <!-- AU-4（§22.19）会话下钻：**引用优先**——先元数据，正文需显式「查看正文」才取 -->
    <el-drawer v-model="convDrawer" :title="t('convDrillTitle')" size="560px">
      <div v-if="convMeta" class="text-body-2">
        <div class="d-flex ga-2 py-1">
          <span class="font-weight-medium" style="min-width: 140px">{{ t('convOwner') }}</span>
          <span class="text-medium-emphasis">{{ convMeta.userId }}</span>
        </div>
        <div class="d-flex ga-2 py-1">
          <span class="font-weight-medium" style="min-width: 140px">{{ t('convMsgCount') }}</span>
          <span class="text-medium-emphasis">{{ convMeta.messageCount }}</span>
        </div>
        <div class="d-flex ga-2 py-1">
          <span class="font-weight-medium" style="min-width: 140px">{{ t('convProvider') }}</span>
          <span class="text-medium-emphasis">{{ convMeta.provider }} / {{ convMeta.model }}</span>
        </div>
        <div class="d-flex ga-2 py-1">
          <span class="font-weight-medium" style="min-width: 140px">{{ t('timeCol') }}</span>
          <span class="text-medium-emphasis">
            {{ formatTime(convMeta.createdAt) }} → {{ formatTime(convMeta.lastActivityAt) }}
          </span>
        </div>
      </div>
      <el-divider />
      <template v-if="!convMessages">
        <div class="text-body-2 text-medium-emphasis mb-2">{{ t('convBodyHint') }}</div>
        <el-button size="small" type="primary" :loading="convLoading" @click="loadConvBody">
          {{ t('convShowBody') }}
        </el-button>
      </template>
      <div v-else>
        <div v-for="(m, i) in convMessages" :key="i" class="mb-2 d-flex ga-2">
          <el-tag size="small" effect="plain">{{ m.role }}</el-tag>
          <span class="text-body-2">{{ m.content }}</span>
        </div>
      </div>
    </el-drawer>
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
import FieldDiff from '@/components/FieldDiff.vue'
import TrendBarList from '@/components/TrendBarList.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { adminApi } from '@/api/admin'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import { toolLabel, toolArgsSummary, errorLabel } from '@/utils/businessLabel'
import type { AuditLog, UsageStats, ChainVerifyResult, AuditInterpretation, IdentityChain, CoverageStatement } from '@/types/audit'
import type { AiConversationMeta, AiConversationMessage } from '@/types/admin'

const { t, te, messages, locale } = useI18n()
const feature = computed(() => (messages.value[String(locale.value)] as { feature?: Record<string, string> } | undefined)?.feature)
const route = useRoute()
const snackbar = useSnackbarStore()

const logs = ref<AuditLog[]>([])
const stats = ref<UsageStats | null>(null)
const chainVerify = ref<ChainVerifyResult | null>(null)
// Chain nodes are technical evidence: the reader opens them explicitly (AW-4 default).
const showChain = ref(false)
// AW-3 覆盖声明。`coverageLoaded` 单拎出来，是为了让「取不到」**不静默** —— 一句告诫取不到，
// 读者会把这份视图读成完整，那正是这个特性要防的事。
// AW-3 coverage statement. `coverageLoaded` is separate so that a fetch failure is NOT silent: a
// missing caveat reads as completeness, which is the one thing this feature exists to prevent.
const coverage = ref<CoverageStatement | null>(null)
const coverageLoaded = ref(false)
const loading = ref(false)
const userId = ref('')
const agentId = ref('')
const range = ref('all')
const behaviorFilter = ref('')

/** A-8 行为类型判定：AI 执行 / AI 被拒 / AI 越权 / AI 阻断 / 对话（「AI 没做什么」同样是安全证据） */
function behaviorType(l: AuditLog): string {
  if (l.action === 'tool_call' && !l.isError) return 'execute'
  if (l.action === 'tool_call' && l.isError && !l.authorization) return 'failed'
  if (l.action === 'tool_call' && l.isError && l.authorization) return 'denied'
  if (l.action === 'chat') return 'chat'
  return 'other'
}
/**
 * 一条缺口怎么显示：**id 优先**（控制台按当前语言渲染），没有词条时回落 wire 上的英文陈述。
 * 词条缺失由 `check:audit-vocabulary` 拦 —— 往登记表里加一条却没人配词，那时会红。
 *
 * How one gap is rendered: the **id first** (the console renders it in the current language), falling
 * back to the English `statement` from the wire when there is no entry. Missing entries are caught by
 * `check:audit-vocabulary` — add a gap to the registry without translating it and that gate goes red.
 */
function gapLabel(gap: { id: string; statement: string }): string {
  const key = `coverageGap_${gap.id}`
  return te(key) ? t(key) : gap.statement
}

const filteredLogs = computed(() =>
  behaviorFilter.value ? logs.value.filter((l) => behaviorType(l) === behaviorFilter.value) : logs.value,
)
const since = ref<string | undefined>(undefined)
const expanded = ref<AuditLog | null>(null)
const errorLogs = ref<AuditLog[]>([])
const limit = 50

/** AU-4（§22.19）会话下钻：**引用优先**——先元数据；正文不预取，须显式点击 */
const convDrawer = ref(false)
const convId = ref('')
const convMeta = ref<AiConversationMeta | null>(null)
const convMessages = ref<AiConversationMessage[] | null>(null)
const convLoading = ref(false)

async function openConversation(id: string) {
  convId.value = id
  convMeta.value = null
  convMessages.value = null
  convDrawer.value = true
  convLoading.value = true
  try {
    convMeta.value = await adminApi.aiConversationMeta(id)
  } catch {
    snackbar.error(t('convLoadFailed'))
  } finally {
    convLoading.value = false
  }
}

/** 正文**不预取**：只有显式点击才请求会话本体（护栏②「引用优先、不落全文」） */
async function loadConvBody() {
  convLoading.value = true
  try {
    const data = await adminApi.aiConversation(convId.value)
    convMessages.value = data.messages
  } catch {
    snackbar.error(t('convLoadFailed'))
  } finally {
    convLoading.value = false
  }
}

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
    const [logsRes, statsRes, verifyRes, errRes, coverageRes] = await Promise.all([
      auditApi.logs({
        userId: userId.value || undefined,
        agentId: agentId.value || undefined,
        limit,
        since: since.value,
        // A-8 越权专门视图：选「越权/被拒」时走服务端 denied 过滤（is_error + authorization 非空），而非仅过滤已加载的 50 行
        denied: behaviorFilter.value === 'denied' ? 'true' : undefined,
      }),
      auditApi.stats(since.value),
      auditApi.verify().catch(() => null),
      auditApi.logs({ isError: 'true', limit: 5, since: since.value }).catch(() => [] as AuditLog[]),
      auditApi.coverage({ since: since.value }).catch(() => null),
    ])
    logs.value = logsRes
    stats.value = statsRes
    chainVerify.value = verifyRes
    errorLogs.value = errRes
    coverage.value = coverageRes
    coverageLoaded.value = true
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
  identityChain.value = null
  if (!isSame && log) {
    auditApi.interpretation(id).then((r) => { interpretation.value = r }).catch(() => { interpretation.value = null })
    auditApi.chain(id).then((c) => { identityChain.value = c }).catch(() => { identityChain.value = null })
  }
}

/** §internal.16 A-4 审计解释器：展开行的业务摘要 + 证据统计 */
const interpretation = ref<AuditInterpretation | null>(null)
/** §internal.16 A-5 跨系统身份链：展开行的 Human→Agent→Tool→Action + 授权依据 */
const identityChain = ref<IdentityChain | null>(null)

/**
 * P0-20：解释面的状态词表。**不是** tool-effects 那套四值 —— 那套里 `revoke_failed` 说的是「撤销失败」，
 * 而这里要能说出「这次动作失败」「被拒」「等人的批准」「结果未知」这些。八个值与后端
 * `audit-explanation-state.ts` 同源，**两处必须一起改**。
 *
 * P0-20: the explanation surface's own vocabulary. Deliberately **not** the four values tool-effects
 * uses — `revoke_failed` there means "the revoke failed", whereas this surface has to be able to say
 * "the action failed", "it was refused", "it is still waiting for a person" and "nobody knows". The
 * eight values are the same set as the back end's `audit-explanation-state.ts`; the two move together.
 */
const explanationStateLabels = computed<Record<string, string>>(() => ({
  awaiting_confirmation: t('explanationStateAwaiting'),
  compensation_failed: t('explanationStateCompensationFailed'),
  compensation_succeeded: t('explanationStateCompensationSucceeded'),
  compensating: t('explanationStateCompensating'),
  executed: t('explanationStateExecuted'),
  failed: t('explanationStateFailed'),
  rejected: t('explanationStateRejected'),
  result_unknown: t('explanationStateResultUnknown'),
}))

/** 颜色只表达「该注意什么」：红的要处理、黄的等人、绿的已了结、蓝的在进行。 */
const explanationStateColors: Record<string, string> = {
  awaiting_confirmation: 'warning',
  compensation_failed: 'danger',
  compensation_succeeded: 'success',
  compensating: 'info',
  executed: 'success',
  failed: 'danger',
  rejected: 'warning',
  result_unknown: 'danger',
}

/** 操作审计行的 `payload` 里那条可读的「方法 + 路径」；读不出就什么都不显示（不编一个）。 */
function opPath(payload: unknown): string {
  const p = payload as { method?: string; path?: string } | null
  return p?.path ? `${p.method ?? ''} ${p.path}`.trim() : ''
}

/**
 * §7.3: the four revoke states must not be read as one another. `compensating` in particular is a
 * request, not a restored business record, so it never borrows the "revoked" label. An unknown future
 * value falls back to itself rather than being hidden or guessed.
 *
 * §7.3：四个撤销状态不能互相读错。`compensating` 是「已请求补偿」，不是「业务已恢复」，故绝不借用
 * 「已撤销」的文案。未来出现的未知值原样保留，既不隐瞒也不臆造。
 */
function revokeStatusLabel(status: string): string {
  const map: Record<string, string> = {
    revoked: t('statusRevoked'),
    compensating: t('statusRevokingExternal'),
    revoke_failed: t('statusRevokeFailed'),
  }
  return map[status] ?? status
}

/** Both windows are uncertain in different ways; say which uncertainty, never "done". */
function revokeWindowLabel(window: string): string {
  if (window === 'unacknowledged') return t('revokeWindowUnacknowledged')
  if (window === 'awaiting_target') return t('revokeWindowAwaitingTarget')
  return window
}

function hasStats(s: AuditInterpretation['summary']['stats']): boolean {
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

/**
 * The recent-errors line is a business summary: a recognised error keeps its translated label, an
 * unknown one becomes "execution failed" plus the business action rather than the raw English
 * message. The raw text stays available in the row's technical detail.
 *
 * 最近错误那一行是业务摘要：已知错误保留译文，未识别的错误显示「执行出错」+ 业务动作，而不是原始英文
 * 报文。原始文本仍在该行的技术详情里。
 */
function errorSummary(log: AuditLog): string {
  const raw = log.errorMessage || ''
  if (!raw) return actionLabel(log)
  const label = errorLabel(raw, t)
  return `${label === raw ? t('executionError') : label} · ${actionLabel(log)}`
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
/* AW-3 覆盖声明：一条缺口一行，严重度标签与文本基线对齐。 */
.coverage-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 4px;
}
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

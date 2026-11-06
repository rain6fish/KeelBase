<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navAiTools')" />

    <!-- N-6 AI-23 内容安全配置（Settings ai_content_safety，实时生效） -->
    <el-card v-if="canEdit" shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center justify-space-between">
          <span>{{ t('contentSafetyTitle') }}</span>
          <div>
            <el-button text :disabled="savingSafety" @click="loadContentSafety()">
              <template #icon><AppIcon icon="mdi-restore" /></template>
              {{ t('resetPolicy') }}
            </el-button>
            <el-button type="primary" :loading="savingSafety" @click="onSaveContentSafety()">
              <template #icon><AppIcon icon="mdi-content-save" /></template>
              {{ t('savePolicy') }}
            </el-button>
          </div>
        </div>
      </template>
      <div class="d-flex align-center ga-2 mb-3">
        <el-switch v-model="contentSafety.enabled" />
        <span class="text-caption text-medium-emphasis">{{ t('contentSafetyHint') }}</span>
      </div>
      <div class="mb-3">
        <div class="text-caption font-weight-medium mb-1">{{ t('contentSensitiveWords') }}</div>
        <el-input v-model="contentSafety.sensitiveText" type="textarea" :rows="4" :placeholder="t('contentWordsPlaceholder')" />
      </div>
      <div>
        <div class="text-caption font-weight-medium mb-1">{{ t('contentJailbreakWords') }}</div>
        <el-input v-model="contentSafety.jailbreakText" type="textarea" :rows="3" :placeholder="t('contentWordsPlaceholder')" />
      </div>
    </el-card>

    <el-card shadow="never" class="mb-4">
      <template #header>{{ t('toolInventory') }}</template>
      <div v-if="tools.length">
        <el-row :gutter="16">
          <el-col v-for="tool in tools" :key="tool.name" :xs="24" :md="12" :lg="8">
            <el-card shadow="never" class="mb-4">
              <template #header>
                <div class="text-subtitle-1 d-flex align-center ga-2">
                  <AppIcon
                    :icon="tool.requiresConfirmation ? 'mdi-shield-check-outline' : 'mdi-wrench-outline'"
                    :color="tool.requiresConfirmation ? 'var(--el-color-warning)' : 'var(--el-color-primary)'"
                    size="18"
                  />
                  {{ tool.name }}
                  <el-tag v-if="tool.requiresConfirmation" size="small" type="warning" effect="light">{{ t('requiresConfirmation') }}</el-tag>
                  <el-tag v-if="tool.riskLevel" size="small" :type="riskTag(tool).type" effect="light">{{ tool.riskLevel }} · {{ riskTag(tool).label }}</el-tag>
                  <el-tag v-if="tool.revokeClass" size="small" :type="revokeClassTag(tool.revokeClass, t).type" effect="plain">{{ revokeClassTag(tool.revokeClass, t).label }}</el-tag>
                </div>
              </template>
              <div class="text-caption">
                <div class="text-medium-emphasis mb-1">{{ tool.description }}</div>
                <div v-if="tool.parameters.length">
                  <span class="font-weight-medium">{{ t('parameters') }}:</span>
                  {{ tool.parameters.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ') }}
                </div>
                <div v-if="tool.permissions?.adminOnly" class="text-error">{{ t('adminOnly') }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
      <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
    </el-card>

    <!-- AW-16：此刻哪些调用在途 —— 管理员与审计读者都读得到（服务端判 `read AuditLog`）。
         「在途」= 仍是 claimed；落定/释放后即从列表消失。参数只给摘要，不回显明文。 -->
    <PageHeader v-if="canReadClaims" :title="t('inFlightClaims')">
      <el-button @click="loadInFlight()">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <el-card v-if="canReadClaims" shadow="never" class="mb-4">
      <div class="d-flex ga-3 align-center">
        <el-input v-model="claimUserId" :placeholder="t('filterByUserId')" clearable style="max-width: 180px" />
        <el-input v-model="claimToolName" :placeholder="t('inFlightFilterByTool')" clearable style="max-width: 220px" />
        <el-checkbox v-model="claimStaleOnly">{{ t('inFlightOnlyStale') }}</el-checkbox>
        <el-button type="primary" @click="loadInFlight()">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        {{ t('inFlightHint', { scope: claimScopeLabel, threshold: claimThreshold }) }}
      </div>
      <div class="text-caption text-medium-emphasis">
        {{ t('inFlightCount', { shown: claims.length, total: claimTotal }) }}
      </div>
    </el-card>

    <AppTable v-if="canReadClaims" class="in-flight-claims" :headers="claimHeaders" :items="claims" :loading="claimsLoading">
      <template #item.argsHash="{ item }"><code class="text-caption">{{ item.argsHash }}</code></template>
      <template #item.claimedAt="{ item }">{{ formatTime(item.claimedAt) }}</template>
      <template #item.ageMinutes="{ item }">{{ item.ageMinutes }} {{ t('inFlightMinutes') }}</template>
      <template #item.stale="{ item }">
        <el-tag v-if="item.stale" size="small" type="warning" effect="light">{{ t('inFlightStale') }}</el-tag>
        <span v-else class="text-caption text-medium-emphasis">{{ t('inFlightRunning') }}</span>
      </template>
      <!-- AW-17：目标状态读数。「从没问过」如实写「未查询」——它绝不能读成「已执行」；
           无结论的查询是**警示**，不是成功。 -->
      <template #item.targetStatus="{ item }">
        <template v-if="item.lastLookup">
          <el-tag size="small" effect="light" :type="lookupTagType(item.lastLookup)">
            {{ lookupLabel(item.lastLookup) }}
          </el-tag>
          <div class="text-caption text-medium-emphasis">{{ formatTime(item.lastLookup.at) }}</div>
          <div v-if="item.lastLookup.reason" class="text-caption text-warning">
            {{ lookupReasonLabel(item.lastLookup.reason) }}
          </div>
        </template>
        <span v-else class="text-caption text-medium-emphasis">{{ t('statusNotLookedUp') }}</span>
      </template>
      <template #item.actions="{ item }">
        <!-- 查询是一次写侧治理动作（服务端 `manage all`），故审计读者只读不点 -->
        <el-button
          v-if="canEdit && item.stale && item.reconcilable"
          text
          size="small"
          type="primary"
          class="reconcile-btn"
          :loading="reconcilingId === item.id"
          :title="t('reconcileTargetStatus')"
          @click="onReconcile(item)"
        >
          <AppIcon icon="mdi-magnify-scan" />
        </el-button>
        <span
          v-else-if="item.stale && !item.reconcilable"
          class="text-caption text-medium-emphasis"
          :title="t('targetStatusUnavailable')"
        >{{ t('targetStatusUnavailableShort') }}</span>
        <el-button text size="small" :title="t('lookupHistory')" @click="openLookupHistory(item)">
          <AppIcon icon="mdi-history" />
        </el-button>
      </template>
    </AppTable>

    <PageHeader v-if="canEdit" :title="t('toolEffects')">
      <el-button @click="loadEffects()">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <el-card v-if="canEdit" shadow="never" class="mb-4">
      <div class="d-flex ga-3 align-center">
        <el-input v-model="effectUserId" :label="t('filterByUserId')" type="number" style="max-width: 180px" />
        <el-button type="primary" @click="loadEffects(1)">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
      </div>
    </el-card>

    <AppTable v-if="canEdit" class="effects-ledger" :headers="effectHeaders" :items="effects" :loading="effectsLoading" :total="effectTotal" :items-per-page="limit">
      <template #item.resultType="{ item }">
        <StatusChip :status="item.resultType" :label-map="resultTypeMap" />
      </template>
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.targetTitle="{ item }">
        <div>{{ item.targetTitle || '-' }}</div>
        <!-- REV-11 / REV-7：两件此前读不出来的事，现在由该行自己回答 -->
        <div class="text-caption text-medium-emphasis">
          <span v-if="item.ownerUserId">{{ t('ownerUserId') }}: {{ item.ownerUserId }}</span>
          <span v-if="item.agentId"> · {{ t('agentId') }}: {{ item.agentId }}</span>
          <!-- REV-11：已认领就写明谁接手了；未认领且滞留则由操作列的认领钮承载 -->
          <span v-if="item.revokeClaimedBy"> · {{ t('claimedBy') }}: {{ item.revokeClaimedBy }}</span>
        </div>
        <!-- REV-6/REV-13：身份缺「变更」那半 —— 四种成因不等价，故障那两种不该被读成设计 -->
        <div v-if="item.identityIncomplete" class="text-caption text-warning">
          {{ t('identityIncomplete') }}
          <span v-if="item.identityIncompleteReason">· {{ item.identityIncompleteReason }}</span>
          <span v-else>· {{ t('identityReasonUnknown') }}</span>
        </div>
        <!-- REV-10：本次调用写了、账上却没有的行 —— **写时**就看得见，不必等撤销时才发现 -->
        <div v-if="item.undeclaredWrites?.length" class="text-caption text-error">
          {{ t('undeclaredWrites', { n: item.undeclaredWrites.length }) }}:
          {{ undeclaredLabel(item) }}
        </div>
      </template>
      <template #item.fieldDiff="{ item }">
        <el-button v-if="item.afterSnapshot" text size="small" type="primary" @click="showDiff(item)">
          {{ diffCount(item) }} {{ t('diffFields') }}
        </el-button>
        <span v-else class="text-medium-emphasis">—</span>
      </template>
      <template #item.status="{ item }">
        <!-- REV-1: when the group's declaration and its held rows disagree, the primary reading must
             not be the green "active" chip — reading a bookkeeping disagreement as "all fine" is
             exactly what this prevents.
             REV-1：该组的「声明」与「持有」在打架时，主读数不得是绿色的「进行中」——
             把两本账不一致读成「一切正常」，正是这条要挡的。 -->
        <StatusChip v-if="item.disputed" status="disputed" :label-map="effectStatusMap" :color-map="effectStatusColorMap" />
        <!-- ARC-6: acknowledging means "a human looked and accepted the evidence", not "the
             disagreement went away" — so it is still not green, and it says who acknowledged when.
             ARC-6：确认 = 「有人看过并接受了证据」，不是「不一致消失了」——仍不是绿色，且注明谁在何时确认 -->
        <template v-else-if="item.dispute?.acknowledgedAt">
          <StatusChip status="disputedAck" :label-map="effectStatusMap" :color-map="effectStatusColorMap" />
          <div class="text-caption text-medium-emphasis mt-1">
            {{ t('effectDisputedAcknowledged', { by: item.dispute.acknowledgedBy || '-', at: formatTime(item.dispute.acknowledgedAt) }) }}
          </div>
        </template>
        <!-- KB-6 据档位诚实渲染：none 不承诺可撤；governed_external 撤销后显示"已请求补偿/结果未知"而非已撤销 -->
        <StatusChip v-else-if="item.status === 'revoked'" status="cancelled" :label-map="effectStatusMap" :color-map="effectStatusColorMap" />
        <StatusChip v-else-if="item.status === 'revoking_external'" status="revoking" :label-map="effectStatusMap" :color-map="effectStatusColorMap" />
        <StatusChip v-else-if="item.status === 'revoke_failed'" status="error" :label-map="effectStatusMap" :color-map="effectStatusColorMap" />
        <StatusChip v-else status="ok" :label-map="effectStatusMap" :color-map="effectStatusColorMap" />
        <!-- REV-2 refinement: "external revoke pending" splits into two windows — may never have
             reached the target vs. reached it and heard nothing back.
             REV-2 细化：「外部撤销中」再分两窗——可能根本没到达 vs 到达了但没回音 -->
        <div
          v-if="item.revokeWindow"
          class="text-caption mt-1"
          :class="item.revokeWindow === 'unacknowledged' ? 'text-warning' : 'text-medium-emphasis'"
        >
          <span class="font-weight-medium">{{ t('revokeWindowLabel') }}:</span>
          {{ revokeWindowLabel(item.revokeWindow) }}
        </div>
      </template>
      <template #item.actions="{ item }">
        <el-button
          v-if="canRevoke(item)"
          text
          size="small"
          type="danger"
          :title="t('revokeEffect')"
          @click="confirmRevoke(item)"
        >
          <AppIcon icon="mdi-undo-variant" />
        </el-button>
        <span v-else-if="item.status === 'revoking_external'" class="text-medium-emphasis text-caption">{{ t('revokingExternalHint') }}</span>
        <span v-else-if="item.status === 'revoke_failed'" class="text-error text-caption">{{ t('revokeFailed') }}</span>
        <span v-else class="text-medium-emphasis text-caption">—</span>
        <!-- REV-11：滞留且无人接手 ⇒ 可认领。这是**派生**读数（服务端给），不是前端自己算的 -->
        <el-button
          v-if="item.revokeNeedsClaim"
          text
          size="small"
          type="warning"
          :title="t('claimEffect')"
          @click="onClaim(item)"
        >
          <AppIcon icon="mdi-account-arrow-right-outline" />
        </el-button>
        <!-- ARC-6：有争议且**尚未确认** ⇒ 可确认（解除「未了结」，证据仍留） -->
        <el-button
          v-if="item.disputed && !item.dispute?.acknowledgedAt"
          text
          size="small"
          type="info"
          :title="t('acknowledgeDispute')"
          @click="onAcknowledgeDispute(item)"
        >
          <AppIcon icon="mdi-flag-checkered" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination v-if="canEdit" :page="effectPage" :limit="limit" :total="effectTotal" :loading="effectsLoading" @update:page="loadEffects" />

    <ConfirmDialog
      v-if="canEdit"
      v-model="showRevoke"
      :title="t('revokeEffect')"
      :content="t('revokeEffectConfirm', { title: pending?.targetTitle || `#${pending?.resultId}` })"
      @confirm="onRevoke"
    />

    <!-- E-1 字段级变更审计：副作用目标记录 before/after diff -->
    <el-dialog v-if="canEdit" v-model="showDiffDialog" :title="t('fieldChange')" width="600px">
      <FieldDiff v-if="diffTarget" :before="diffTarget.beforeSnapshot" :after="diffTarget.afterSnapshot" />
    </el-dialog>

    <!-- AW-17：查询历史（只读证据）——「问过什么、回来的是什么」，最近的在前 -->
    <el-dialog v-model="showLookupHistory" :title="t('lookupHistory')" width="720px">
      <div class="text-caption text-medium-emphasis mb-2">
        {{ t('lookupHistoryHint', { tool: lookupHistoryClaim?.toolName ?? '' }) }}
      </div>
      <el-table v-if="lookupHistory.length" :data="lookupHistory" size="small">
        <el-table-column :label="t('lookupAt')">
          <template #default="{ row }">{{ formatTime(row.at) }}</template>
        </el-table-column>
        <el-table-column :label="t('statusCol')">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="lookupTagType(row)">{{ lookupLabel(row) }}</el-tag>
            <div v-if="row.reason" class="text-caption text-warning">{{ lookupReasonLabel(row.reason) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="lookedUpBy" :label="t('lookupBy')" width="110" />
        <el-table-column prop="queryPath" :label="t('lookupPath')" />
      </el-table>
      <div v-else class="text-caption text-medium-emphasis">{{ t('statusNotLookedUp') }}</div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import StatusChip from '@/components/StatusChip.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FieldDiff from '@/components/FieldDiff.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { useAuthStore } from '@/stores/auth'
import { aiToolsApi } from '@/api/aiTools'
import { settingsApi } from '@/api/settings'
import { formatTime } from '@/utils/format'
import { revokeClassTag } from '@/utils/revokeClass'
import type { AdminAiTool, InFlightClaim, TargetStatusLookup, ToolEffect } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()
const auth = useAuthStore()
// AW-2: the auditor reads the tool inventory; the content-safety editor and the effects ledger are
// admin-only on the server, so they do not render for it (an entry that 403s is worse than none).
//
// AW-16: the in-flight claim read is open to the auditor too (server judges `read AuditLog`), so that
// section renders for `isAdmin || isAuditor` — the one part of this page it can actually read.
//
// AW-2：审计读者只读工具清单；内容安全编辑与副作用账本在服务端仍只给管理员，故对它不渲染。
//
// AW-16：在途占位查询对审计读者也开放（服务端判 `read AuditLog`），故那一节对 `isAdmin || isAuditor`
// 渲染 —— 这是本页它真正读得到的那一部分。
const canEdit = computed(() => auth.isAdmin)
const canReadClaims = computed(() => auth.isAdmin || auth.isAuditor)

const tools = ref<AdminAiTool[]>([])
const effects = ref<ToolEffect[]>([])
const effectTotal = ref(0)
const effectPage = ref(1)
const limit = 20
const effectsLoading = ref(false)
const effectUserId = ref<number | undefined>(undefined)

// AW-16：在途调用（服务端只回工具名与 args_hash；参数明文不在返回里，前端也无从显示）
const claims = ref<InFlightClaim[]>([])
const claimsLoading = ref(false)
const claimTotal = ref(0)
const claimThreshold = ref(60)
const claimScope = ref<'all' | 'org' | 'own'>('all')
const claimUserId = ref('')
const claimToolName = ref('')
const claimStaleOnly = ref(false)
const claimScopeLabel = computed(() =>
  claimScope.value === 'org'
    ? t('inFlightScopeOrg')
    : claimScope.value === 'own'
      ? t('inFlightScopeOwn')
      : t('inFlightScopeAll'),
)
const claimHeaders = computed(() => [
  { key: 'toolName', title: t('tool') },
  { key: 'userId', title: t('inFlightUserId') },
  { key: 'argsHash', title: 'args_hash' },
  { key: 'claimedAt', title: t('inFlightClaimedAt') },
  { key: 'ageMinutes', title: t('inFlightAge') },
  { key: 'attempts', title: t('inFlightAttempts') },
  { key: 'stale', title: t('statusCol') },
  { key: 'targetStatus', title: t('targetStatusCol') },
  { key: 'actions', title: t('actionCol') },
])

/**
 * AW-17: the three readings of a lookup, and their **tones**. `unknown` is a warning, never a
 * success — the target did not answer, and painting that green would assert an outcome it never gave.
 *
 * AW-17：一次查询的三种读数与它们的**色调**。`unknown` 是警示，绝不是成功 —— 目标没有回答，
 * 把它涂成绿色等于断言一个它从未给出的结局。
 */
function lookupTagType(l: TargetStatusLookup): 'primary' | 'info' | 'warning' {
  if (l.conclusion === 'executed') return 'primary'
  if (l.conclusion === 'not_executed') return 'info'
  return 'warning'
}

function lookupLabel(l: TargetStatusLookup): string {
  if (l.conclusion === 'executed') return t('lookupExecuted')
  if (l.conclusion === 'not_executed') return t('lookupNotExecuted')
  return t('lookupUnknown')
}

/** Every cause means "the target did not tell us" — none of them is "it did not run". */
const LOOKUP_REASON_KEYS: Record<string, string> = {
  'target-status-unavailable': 'lookupReasonUnavailable',
  misconfigured: 'lookupReasonMisconfigured',
  timeout: 'lookupReasonTimeout',
  unreachable: 'lookupReasonUnreachable',
  call_failed: 'lookupReasonCallFailed',
  non_2xx: 'lookupReasonNon2xx',
  unrecognized_answer: 'lookupReasonUnrecognized',
}

function lookupReasonLabel(reason: string): string {
  const key = LOOKUP_REASON_KEYS[reason]
  return key ? t(key) : reason
}
// E-1 字段级变更审计：查看目标记录 before/after diff
const diffTarget = ref<ToolEffect | null>(null)
const showDiffDialog = ref(false)

// N-6 内容安全配置编辑状态（textarea 用文本，保存时 split）
const contentSafety = ref<{ enabled: boolean; sensitiveText: string; jailbreakText: string }>({ enabled: true, sensitiveText: '', jailbreakText: '' })
const savingSafety = ref(false)

const resultTypeMap = computed(() => ({ event: t('events'), todo: t('todos') }))
// KB-6：副作用归一状态文案 + 色（revoking_external = 已请求外部补偿/结果未知，禁显示 revoked）
const effectStatusMap = computed(() => ({
  ok: t('active'),
  cancelled: t('cancelled'),
  revoking: t('statusRevokingExternal'),
  error: t('statusRevokeFailed'),
  // REV-1 / ARC-6: a dispute is **another reading**, not folded into the four values above — open is
  // red, acknowledged is orange (still not green).
  // REV-1 / ARC-6：争议是**另一种读数**，不混进上面四值——未了结给红，已确认给橙（仍不是绿）
  disputed: t('effectDisputed'),
  disputedAck: t('effectDisputedAckChip'),
}))
const effectStatusColorMap = computed(() => ({
  ok: 'success',
  cancelled: 'warning',
  revoking: 'warning',
  error: 'danger',
  disputed: 'danger',
  disputedAck: 'warning',
}))


/** 撤销可点：服务端单一权威下发 revocable（不再客户端重算档位规则，防与后端漂移） */
function canRevoke(item: ToolEffect): boolean {
  return item.revocable ?? false
}

/**
 * REV-2 refinement: the two window readings of `compensating`. Neither means "revoked", but their
 * uncertainty differs: no acknowledgement = the request may never have arrived; acknowledged =
 * it did arrive and only the final state is missing. The server already computed it
 * (`revokeWindow`); the front end only renders the two values as distinguishable sentences.
 *
 * REV-2 细化：`compensating` 的两个窗口读数。两者都**不是**「已撤销」，但不确定性不同：
 * 无确认凭据 = 请求可能根本没到达；有确认凭据 = 确实到达了、只是没有终态。
 * 服务端已算好（`revokeWindow`），前端只负责把两个值渲染成可区分的一句话。
 */
function revokeWindowLabel(window: string): string {
  return window === 'unacknowledged' ? t('revokeWindowUnacknowledged') : t('revokeWindowAwaitingTarget')
}

/**
 * REV-10：把「账上没有的写」渲染成一行可读文本（`实体#id`）。主键未知时给 `?` ——
 * 「知道写了那张表、不知道哪一行」仍然是「账上没有」，不拿一个假 id 去填。
 */
function undeclaredLabel(item: ToolEffect): string {
  return (item.undeclaredWrites ?? []).map((w) => `${w.entity}#${w.id ?? '?'}`).join(', ')
}

/** E-1：副作用目标记录字段变更数（无快照 0；非法 JSON 0） */
function diffCount(item: ToolEffect): number {
  if (!item.afterSnapshot) return 0
  try {
    const after = JSON.parse(item.afterSnapshot) as Record<string, unknown>
    if (!item.beforeSnapshot) return Object.keys(after).length
    const before = JSON.parse(item.beforeSnapshot) as Record<string, unknown>
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).length
  } catch {
    return 0
  }
}

function showDiff(item: ToolEffect) {
  diffTarget.value = item
  showDiffDialog.value = true
}

/** W5 风险级标签：R5 阻断（红）/ R4 人工审批（橙）/ R3 需确认（橙）/ R0-R2 自动（绿） */
function riskTag(tool: AdminAiTool) {
  const lv = tool.riskLevel || ''
  if (lv === 'R5') return { label: t('riskBlocked'), type: 'danger' as const }
  if (lv === 'R4') return { label: t('riskApproval'), type: 'warning' as const }
  if (lv === 'R3') return { label: t('riskConfirm'), type: 'warning' as const }
  return { label: t('riskAuto'), type: 'success' as const }
}

const effectHeaders = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'toolName', title: t('tool') },
  { key: 'resultType', title: t('resultType') },
  { key: 'resultId', title: t('resultId') },
  { key: 'targetTitle', title: t('titleLabel') },
  { key: 'fieldDiff', title: t('fieldChange') },
  { key: 'status', title: t('statusCol') },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

/** 加载工具清单（治理策略编辑已收敛至独立「策略中心」，不在此维护双编辑器）。 */
async function loadTools() {
  try {
    tools.value = await aiToolsApi.tools()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

/** N-6 加载内容安全配置（Settings ai_content_safety） */
async function loadContentSafety() {
  try {
    const rows = await settingsApi.list()
    const row = rows.find((r) => r.key === 'ai_content_safety')
    if (row) {
      const parsed = JSON.parse(row.value || '{}') as { enabled?: boolean; sensitive?: string[]; jailbreak?: string[] }
      contentSafety.value = {
        enabled: parsed.enabled !== false,
        sensitiveText: Array.isArray(parsed.sensitive) ? parsed.sensitive.join('\n') : '',
        jailbreakText: Array.isArray(parsed.jailbreak) ? parsed.jailbreak.join('\n') : '',
      }
    } else {
      contentSafety.value = { enabled: true, sensitiveText: '', jailbreakText: '' }
    }
  } catch {
    // 缺省不填（默认表由后端兜底）
  }
}

/** N-6 保存内容安全配置（换行/逗号分隔 → JSON → PUT 实时生效） */
async function onSaveContentSafety() {
  savingSafety.value = true
  try {
    const split = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean)
    await settingsApi.update(
      'ai_content_safety',
      JSON.stringify({
        enabled: contentSafety.value.enabled,
        sensitive: split(contentSafety.value.sensitiveText),
        jailbreak: split(contentSafety.value.jailbreakText),
      }),
    )
    snackbar.success(t('policySaved'))
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    savingSafety.value = false
  }
}

/**
 * AW-16：拉一次「此刻在途」的只读快照。服务端已经决定了行范围与滞留判据，前端只做渲染 ——
 * 这里没有第二套「哪些算在途」的规则（状态既不落定也不释放，读数不改事实）。
 *
 * AW-16: one read-only snapshot of "in flight right now". The server owns both the row scope and the
 * staleness cut; the front end only renders — there is no second definition of "in flight" here, and
 * reading changes nothing (a stale row is neither settled nor released by being looked at).
 */
async function loadInFlight() {
  claimsLoading.value = true
  try {
    const res = await aiToolsApi.inFlightClaims({
      userId: claimUserId.value.trim() || undefined,
      toolName: claimToolName.value.trim() || undefined,
      stale: claimStaleOnly.value,
    })
    claims.value = res.items
    claimTotal.value = res.total
    claimThreshold.value = res.thresholdMinutes
    claimScope.value = res.scope
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    claimsLoading.value = false
  }
}

// AW-17：查询历史（只读证据）与「查询目标状态」的一次性动作
const reconcilingId = ref<number | null>(null)
const showLookupHistory = ref(false)
const lookupHistory = ref<TargetStatusLookup[]>([])
const lookupHistoryClaim = ref<InFlightClaim | null>(null)

const RECONCILE_REFUSAL_KEYS: Record<string, string> = {
  not_stale: 'reconcileNotStale',
  not_claimable: 'reconcileNotClaimable',
  not_found: 'reconcileNotFound',
}

/**
 * AW-17: perform the one-shot target-status query and report the outcome **by kind**.
 *
 * A refusal (`not_stale` / `not_claimable` / `not_found`) and an inconclusive answer (`unresolved`)
 * are not the same thing, and none of them is a success: the ledger only moves on a real answer.
 * The two `reconciled` cases name which answer landed, so the operator reads what actually happened.
 *
 * AW-17：执行一次目标状态查询，并按**种类**报出结果。
 *
 * 拒绝（`not_stale` / `not_claimable` / `not_found`）与无结论（`unresolved`）不是一回事，且都不是成功：
 * 只有真答案才让账动。两种 `reconciled` 各自写明落地的是哪个答案，操作者读到的是实际发生的事。
 */
async function onReconcile(item: InFlightClaim) {
  reconcilingId.value = item.id
  try {
    const res = await aiToolsApi.reconcileClaim(item.id)
    if (res.outcome === 'reconciled') {
      snackbar.success(
        res.conclusion === 'executed' ? t('reconcileDoneExecuted') : t('reconcileDoneNotExecuted'),
      )
    } else if (res.outcome === 'unresolved') {
      snackbar.warning(
        t('reconcileUnresolved', {
          reason: res.evidence?.reason ? lookupReasonLabel(res.evidence.reason) : '-',
        }),
      )
    } else {
      snackbar.warning(t(RECONCILE_REFUSAL_KEYS[res.outcome] ?? 'reconcileNotStale'))
    }
    await loadInFlight()
    if (lookupHistoryClaim.value?.id === item.id) await loadLookupHistory(item)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    reconcilingId.value = null
  }
}

function openLookupHistory(item: InFlightClaim) {
  lookupHistoryClaim.value = item
  showLookupHistory.value = true
  loadLookupHistory(item)
}

/** 读一次历史。失败只提示 —— 它不改任何状态，静默吞掉会让「没有记录」与「读不到」混在一起。 */
async function loadLookupHistory(item: InFlightClaim) {
  try {
    const res = await aiToolsApi.claimLookups(item.id)
    lookupHistory.value = res.items
  } catch (err) {
    lookupHistory.value = []
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

async function loadEffects(p = 1) {
  effectsLoading.value = true
  try {
    const res = await aiToolsApi.effects(effectUserId.value, p, limit)
    effects.value = res.items
    effectTotal.value = res.total
    effectPage.value = p
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    effectsLoading.value = false
  }
}

const showRevoke = ref(false)
const pending = ref<ToolEffect | null>(null)
function confirmRevoke(item: ToolEffect) {
  pending.value = item
  showRevoke.value = true
}
async function onRevoke() {
  if (!pending.value) return
  try {
    await aiToolsApi.revokeEffect(pending.value.id)
    snackbar.success(t('revoked'))
    loadEffects(effectPage.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('revokeFailed'))
  } finally {
    showRevoke.value = false
  }
}

/**
 * REV-11：认领一条滞留补偿。服务端的拒绝**分种类**（`not_stale` / `already_claimed` / `not_found`）——
 * 对看台子的人是三回事，故各自给一句文案，不压成一个「失败」。
 */
const CLAIM_REFUSAL_KEYS: Record<string, string> = {
  not_stale: 'claimNotStale',
  already_claimed: 'claimAlreadyClaimed',
  not_found: 'claimNotFound',
}

async function onClaim(item: ToolEffect) {
  try {
    const res = await aiToolsApi.claimEffect(item.id)
    if (res.outcome === 'claimed') snackbar.success(t('claimDone'))
    else snackbar.warning(t(CLAIM_REFUSAL_KEYS[res.outcome] ?? 'claimNotStale'))
    loadEffects(effectPage.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

/** ARC-6：确认争议 —— 解除「未了结」，证据仍留。人的动作，故失败要报出来而不是静默。 */
async function onAcknowledgeDispute(item: ToolEffect) {
  try {
    await aiToolsApi.acknowledgeDispute(item.id)
    snackbar.success(t('disputeAcknowledged'))
    loadEffects(effectPage.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

onMounted(() => {
  loadTools()
  // AW-16：在途调用与工具清单同属两者都可读的那部分；副作用账本与内容安全仍只给管理员。
  if (canReadClaims.value) loadInFlight()
  if (!canEdit.value) return
  loadEffects()
  loadContentSafety()
})
</script>

<template>
  <div>
    <PageHeader :title="t('navAiTimeline')" :subtitle="t('aiTimelineHint')">
      <el-button @click="load">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <el-input v-model="userId" :label="t('filterByUserId')" type="number" style="max-width: 180px" />
        <el-input v-model="agentId" :label="t('filterByAgent')" style="max-width: 180px" />
        <el-button type="primary" @click="load">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
      </div>
    </el-card>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <template v-else>
      <el-empty v-if="sessions.length === 0" :description="t('noTimeline')" :image-size="80" />

      <el-collapse v-for="s in sessions" :key="s.conversationId || 'no-conv'" accordion class="mb-3">
        <el-collapse-item>
          <template #title>
            <div class="d-flex align-center ga-2">
              <AppIcon
                :icon="sessionIcon(s)"
                :color="sessionColor(s) === 'warning' ? 'var(--el-color-warning)' : 'var(--el-color-primary)'"
              />
              <span class="text-body-2">{{ s.conversationId ? t('conversation') + ' ' + shortId(s.conversationId) : t('adhocChat') }}</span>
              <el-tag size="small" effect="light">{{ s.events.length }} {{ t('events') }}</el-tag>
              <el-tag v-if="s.toolEffects.length" size="small" type="warning" effect="light">{{ s.toolEffects.length }} {{ t('toolEffects') }}</el-tag>
              <div v-if="sessionToolChain(s).length" class="d-flex align-center ga-1 flex-wrap mt-1" style="width: 100%">
                <template v-for="(tool, i) in sessionToolChain(s)" :key="i">
                  <el-tag size="small" effect="plain" type="primary" class="chain-tool">{{ tool }}</el-tag>
                  <span v-if="i < sessionToolChain(s).length - 1" class="text-caption text-medium-emphasis">→</span>
                </template>
              </div>
            </div>
          </template>
          <el-timeline>
            <el-timeline-item
              v-for="e in timelineEvents(s)"
              :key="e.key"
              :color="e.color === 'primary' ? 'var(--el-color-primary)' : e.color === 'success' ? 'var(--el-color-success)' : e.color === 'error' ? 'var(--el-color-danger)' : e.color === 'warning' ? 'var(--el-color-warning)' : e.color === 'info' ? 'var(--el-color-info)' : 'var(--el-text-color-secondary)'"
            >
              <el-card shadow="never" class="mb-2">
                <div class="d-flex justify-space-between align-center">
                  <span class="text-caption font-weight-medium" :class="e.colorClass">
                    {{ e.label }}
                  </span>
                  <span class="text-caption text-medium-emphasis">{{ formatTime(e.time) }}</span>
                </div>

                <!-- 工具调用详情（业务语言；技术参数点击展开） -->
                <div v-if="e.type === 'tool_call'" class="mt-1">
                  <el-popover placement="top" :width="380" trigger="click">
                    <template #reference>
                      <span class="font-weight-medium" style="cursor:pointer;border-bottom:1px dashed #cbd5e1">
                        {{ toolLabel(tm('feature'), e.toolName) }}{{ toolArgsSummary(e.toolName, e.args, locale.startsWith('zh')) }}
                      </span>
                    </template>
                    <div class="text-caption">
                      <div class="mb-1 text-medium-emphasis">{{ e.username || '-' }} · {{ formatTime(e.time) }}</div>
                      <div class="mb-2">
                        {{ toolLabel(tm('feature'), e.toolName) }}{{ toolArgsSummary(e.toolName, e.args, locale.startsWith('zh')) }}
                      </div>
                      <div class="text-medium-emphasis mb-1">{{ t('technicalDetail') }}</div>
                      <div class="mb-1"><b>{{ e.toolName }}</b></div>
                      <pre class="text-caption" style="white-space:pre-wrap;margin:0 0 6px">{{ e.args }}</pre>
                      <div v-if="e.errorMessage" class="text-error">{{ e.errorMessage }}</div>
                    </div>
                  </el-popover>
                  <div v-if="e.errorMessage" class="text-body-2 text-error mt-1">{{ errorLabel(e.errorMessage, t) }}</div>
                </div>

                <!-- 确认决策 -->
                <div v-else-if="e.type === 'tool_confirmation'" class="mt-1">
                  <div class="text-body-2">{{ toolLabel(tm('feature'), e.toolName) }}{{ toolArgsSummary(e.toolName, e.args, locale.startsWith('zh')) }}</div>
                  <StatusChip :status="e.outcome === 'approve' ? 'ok' : 'cancelled'" :label-map="outcomeMap" />
                </div>

                <!-- 副作用（AI 实际创建/修改的记录；EB-2 proxy_call = 外部系统 B 路径写调用） -->
                <div v-else-if="e.type === 'effect'" class="mt-1">
                  <div class="d-flex align-center ga-2">
                    <span class="text-body-2">{{ toolLabel(tm('feature'), e.toolName) }}</span>
                    <el-tag v-if="e.effect?.resultType === 'proxy_call'" size="small" type="info" effect="plain">{{ t('externalSystem') }}</el-tag>
                    <StatusChip :status="e.effectStatus" :label-map="effectStatusMap" />
                  </div>
                  <div v-if="e.detail" class="text-body-2 text-medium-emphasis mt-1">{{ e.detail }}</div>
                  <div class="d-flex ga-2 mt-1">
                    <el-button
                      v-if="e.effect"
                      size="small"
                      type="warning"
                      plain
                      :disabled="!e.effect.targetExists || e.effect.targetSoftDeleted"
                      @click="onRevoke(e.effect)"
                    >
                      {{ t('revoke') }} #{{ e.effect.resultId }}
                    </el-button>
                    <el-button
                      v-if="e.effect"
                      size="small"
                      type="info"
                      plain
                      @click="onShowGovernance(e.effect)"
                    >
                      {{ t('governanceDetail') }}
                    </el-button>
                  </div>
                </div>

                <!-- chat / error / navigate 摘要 -->
                <div v-else-if="e.detail" class="text-body-2 text-medium-emphasis mt-1">{{ e.detail }}</div>
                <div v-if="e.type === 'error' && e.errorMessage" class="text-body-2 text-error mt-1">{{ errorLabel(e.errorMessage, t) }}</div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </el-collapse-item>
      </el-collapse>
    </template>

    <!-- D1 治理详情：业务动作 → AI 副作用 + 决策轨迹（Who/When/What/Why/Result/Side Effects/Integrity） -->
    <el-drawer v-model="governanceDrawer" :title="t('governanceDetail')" size="480px">
      <div v-if="governance" class="d-flex flex-column ga-1">
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('who') }}</span>
          <span class="text-body-2">{{ governance.effect.userId }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('when') }}</span>
          <span class="text-body-2">{{ formatTime(governance.effect.createdAt) }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('what') }}</span>
          <span class="text-body-2">{{ governance.effect.toolName }}</span>
        </div>
        <div v-if="governance.effect.argsHash" class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('argsHash') }}</span>
          <code class="text-caption">{{ governance.effect.argsHash }}</code>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('sideEffects') }}</span>
          <span class="text-body-2">{{ governance.effect.resultType }} #{{ governance.effect.resultId }}</span>
        </div>
        <el-divider />
        <div class="text-caption text-medium-emphasis mb-1">{{ t('decisionTrace') }}</div>
        <div v-if="whySteps.length" class="d-flex flex-column ga-2">
          <div v-for="s in whySteps" :key="s.id" class="bordered pa-2">
            <div class="d-flex justify-space-between align-center">
              <span class="text-body-2">{{ s.toolName || s.type }}</span>
              <StatusChip :status="s.type === 'confirmation' ? (s.outcome === 'approve' ? 'ok' : 'cancelled') : s.success === false ? 'error' : s.success === true ? 'ok' : 'info'" :label-map="whyStatusMap" />
            </div>
            <div class="text-body-2 text-medium-emphasis mt-1">{{ whyUserText(s) }}</div>
            <el-collapse class="mt-1">
              <el-collapse-item :title="t('techDetail')">
                <div v-if="s.checks?.length" class="d-flex flex-column ga-1">
                  <div v-for="c in s.checks" :key="c.name" class="text-caption">
                    <StatusChip :status="c.ok ? 'ok' : 'error'" :label-map="checkStatusMap" /> {{ c.name }}{{ c.note ? ' — ' + c.note : '' }}
                  </div>
                </div>
                <div v-if="s.args" class="text-caption mt-1"><code>{{ s.args }}</code></div>
                <div v-if="s.errorMessage" class="text-caption text-error mt-1">{{ s.errorMessage }}</div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>
        <div v-else class="text-body-2 text-medium-emphasis">{{ t('traceEmpty') }}</div>
      </div>
      <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { aiToolsApi } from '@/api/aiTools'
import { formatTime } from '@/utils/format'
import { toolLabel, toolArgsSummary, errorLabel } from '@/utils/businessLabel'
import type { AuditLog } from '@/types/audit'
import type { GovernanceActionResponse, ToolEffect } from '@/types/admin'

const { t, tm, locale } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()

const userId = ref('')
const agentId = ref('')
const logs = ref<AuditLog[]>([])
const effects = ref<ToolEffect[]>([])
const loading = ref(false)
const governanceDrawer = ref(false)
const governance = ref<GovernanceActionResponse | null>(null)

/** D1 Why 双层：决策轨迹中的工具调用/确认步骤（用户视角人类语言 + 技术详情展开） */
interface TraceStepLite {
  id: string
  type: string
  toolName?: string
  args?: string
  success?: boolean
  errorMessage?: string | null
  checks?: Array<{ name: string; ok: boolean; note?: string }>
  outcome?: 'approve' | 'decline' | 'timeout'
}

const whyStatusMap = computed(() => ({
  ok: t('allowed'),
  cancelled: t('rejected'),
  error: t('blocked'),
  info: t('pending'),
}))
const checkStatusMap = computed(() => ({ ok: t('pass'), error: t('denied') }))

const whySteps = computed<TraceStepLite[]>(() => {
  const trace = governance.value?.trace as { steps?: TraceStepLite[] } | null
  if (!trace?.steps) return []
  return trace.steps.filter((s) => s.type === 'tool_call' || s.type === 'confirmation')
})

function whyUserText(s: TraceStepLite): string {
  if (s.type === 'confirmation') {
    return s.outcome === 'approve' ? t('whyConfirmed') : s.outcome === 'decline' ? t('whyDeclined') : t('whyTimeout')
  }
  if (s.success === false) return t('whyBlocked')
  return t('whyAllowed')
}

const outcomeMap = computed(() => ({ ok: t('approved'), cancelled: t('rejected') }))
const effectStatusMap = computed(() => ({
  ok: t('active'),
  cancelled: t('cancelled'),
  down: t('deleted'),
}))

function effectStatus(eff: ToolEffect): string {
  if (eff.targetExists && !eff.targetSoftDeleted) return 'ok'
  if (eff.targetSoftDeleted) return 'cancelled'
  return 'down'
}

// 单个时间线事件（AI 日志 + 副作用合并）
interface TimelineEvent {
  key: string
  type: string
  time: string
  icon: string
  color: string
  colorClass: string
  label: string
  toolName?: string
  args?: string
  detail?: string | null
  errorMessage?: string | null
  outcome?: string
  username?: string | null
  effect?: ToolEffect
  effectStatus?: string
}

async function load() {
  loading.value = true
  try {
    const uid = userId.value ? Number(userId.value) : undefined
    const [logsRes, effRes] = await Promise.all([
      auditApi.logs({ userId: userId.value || undefined, agentId: agentId.value || undefined, limit: 100 }),
      aiToolsApi.effects(uid, 1, 100),
    ])
    logs.value = logsRes
    effects.value = effRes.items
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

interface Session {
  conversationId: string | null
  events: TimelineEvent[]
  toolEffects: ToolEffect[]
}

const sessions = computed<Session[]>(() => {
  const groups = new Map<string, Session>()
  for (const log of logs.value) {
    const conv = log.conversationId || 'no-conv'
    const session = groups.get(conv) || { conversationId: log.conversationId || null, events: [], toolEffects: [] }
    const ev = toEvent(log)
    if (ev) session.events.push(ev)
    groups.set(conv, session)
  }
  for (const eff of effects.value) {
    const conv = eff.conversationId || 'no-conv'
    const session = groups.get(conv) || { conversationId: eff.conversationId || null, events: [], toolEffects: [] }
    session.toolEffects.push(eff)
    // 副作用作为独立时间线事件（AI 实际创建/修改的记录）
    session.events.push({
      key: `effect-${eff.id}`,
      type: 'effect',
      time: eff.createdAt,
      icon: 'mdi-content-save-outline',
      color: eff.targetExists && !eff.targetSoftDeleted ? 'success' : 'grey',
      colorClass: eff.targetExists && !eff.targetSoftDeleted ? 'text-success' : '',
      label: t('toolEffect'),
      toolName: eff.toolName,
      detail: eff.targetTitle || `#${eff.resultId}`,
      effect: eff,
      effectStatus: effectStatus(eff),
    })
    groups.set(conv, session)
  }
  const arr = Array.from(groups.values())
  arr.forEach((s) => {
    s.events.sort((a, b) => (a.time < b.time ? 1 : -1))
  })
  return arr
})

function toEvent(log: AuditLog): TimelineEvent | null {
  const base = {
    key: `${log.id}-${log.action}-${log.createdAt}`,
    time: log.createdAt,
    detail: log.detail,
    errorMessage: log.errorMessage,
    username: log.username,
  }
  switch (log.action) {
    case 'tool_call': {
      // detail 形如 `create_event({"title":...})`
      const m = /^([\w]+)\((.*)\)$/s.exec(log.detail || '')
      return {
        ...base,
        type: 'tool_call',
        toolName: m?.[1] || log.detail || '-',
        args: m?.[2] || '',
        icon: 'mdi-wrench-outline',
        color: 'primary',
        colorClass: 'text-primary',
        label: t('toolCall'),
      }
    }
    case 'tool_confirmation': {
      const m = /^([\w]+)\((.*)\) → (\w+)$/s.exec(log.detail || '')
      return {
        ...base,
        type: 'tool_confirmation',
        toolName: m?.[1] || log.detail || '-',
        args: m?.[2] || '',
        outcome: m?.[3] || 'unknown',
        icon: 'mdi-shield-check-outline',
        color: log.isError ? 'error' : 'success',
        colorClass: log.isError ? 'text-error' : 'text-success',
        label: t('confirmation'),
      }
    }
    case 'error':
      return {
        ...base,
        type: 'error',
        icon: 'mdi-alert-circle-outline',
        color: 'error',
        colorClass: 'text-error',
        label: t('error'),
      }
    case 'navigate':
      return {
        ...base,
        type: 'navigate',
        icon: 'mdi-navigation-variant',
        color: 'info',
        colorClass: 'text-info',
        label: t('navigate'),
      }
    default:
      // chat / plan / analyze / knowledge / delegate → 摘要
      return {
        ...base,
        type: log.action,
        icon: 'mdi-message-outline',
        color: 'grey',
        colorClass: '',
        label: t(`action.${log.action}`) !== `action.${log.action}` ? t(`action.${log.action}`) : log.action,
      }
  }
}

/** E-2 行为回放图形化：会话的工具调用链概览（tool_call/confirmation 序列，头部链式展示一眼看出 AI 执行链） */
function sessionToolChain(s: Session): string[] {
  return s.events
    .filter((e) => e.type === 'tool_call' || e.type === 'tool_confirmation')
    .map((e) => e.toolName || e.type)
}

function sessionIcon(s: Session): string {
  return s.toolEffects.length ? 'mdi-robot-industrial' : 'mdi-forum-outline'
}
function sessionColor(s: Session): string {
  return s.toolEffects.length ? 'warning' : 'primary'
}
function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id
}
function timelineEvents(s: Session): TimelineEvent[] {
  return s.events
}

async function onRevoke(effect: ToolEffect) {
  try {
    await aiToolsApi.revokeEffect(effect.id)
    snackbar.success(t('revoked'))
    load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('revokeFailed'))
  }
}

/** D1 治理详情：业务动作 → AI 副作用 + 决策轨迹（Who/When/What/Why/Result/Side Effects/Integrity） */
async function onShowGovernance(effect: ToolEffect) {
  governanceDrawer.value = true
  governance.value = null
  try {
    governance.value = await aiToolsApi.governanceAction(effect.resultType, effect.resultId)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
    governanceDrawer.value = false
  }
}

onMounted(() => {
  const q = route.query.agentId
  if (typeof q === 'string' && q) agentId.value = q
  load()
})
</script>

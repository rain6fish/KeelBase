<template>
  <div>
    <PageHeader :title="t('navAiTimeline')" :subtitle="t('aiTimelineHint')">
      <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="load">{{ t('refresh') }}</v-btn>
    </PageHeader>

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <v-text-field
          v-model="userId"
          :label="t('filterByUserId')"
          type="number"
          density="comfortable"
          variant="outlined"
          hide-details
          style="max-width: 180px"
        />
        <v-btn color="primary" prepend-icon="mdi-filter-variant" @click="load">{{ t('filter') }}</v-btn>
      </v-card-text>
    </v-card>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <template v-else>
      <div v-if="sessions.length === 0" class="text-medium-emphasis pa-4">{{ t('noTimeline') }}</div>

      <v-expansion-panels v-for="s in sessions" :key="s.conversationId || 'no-conv'" variant="accordion" class="mb-3">
        <v-expansion-panel>
          <v-expansion-panel-title class="d-flex align-center ga-2">
            <v-icon :icon="sessionIcon(s)" :color="sessionColor(s)" />
            <span class="text-body-2">{{ s.conversationId ? t('conversation') + ' ' + shortId(s.conversationId) : t('adhocChat') }}</span>
            <v-chip size="small" variant="tonal" class="ml-2">{{ s.events.length }} {{ t('events') }}</v-chip>
            <v-chip v-if="s.toolEffects.length" size="small" color="warning" variant="tonal" class="ml-1">{{ s.toolEffects.length }} {{ t('toolEffects') }}</v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-timeline side="end" density="compact" align="start">
              <v-timeline-item
                v-for="e in timelineEvents(s)"
                :key="e.key"
                :dot-color="e.color"
                :icon="e.icon"
                size="small"
              >
                <v-card variant="outlined" class="mb-2">
                  <v-card-text class="pa-3">
                    <div class="d-flex justify-space-between align-center">
                      <span class="text-caption font-weight-medium" :class="e.colorClass">
                        {{ e.label }}
                      </span>
                      <span class="text-caption text-medium-emphasis">{{ formatTime(e.time) }}</span>
                    </div>

                    <!-- 工具调用详情 -->
                    <div v-if="e.type === 'tool_call'" class="mt-1">
                      <div class="text-body-2">{{ e.toolName }} <code class="text-caption">{{ e.args }}</code></div>
                      <div v-if="e.errorMessage" class="text-body-2 text-error mt-1">{{ e.errorMessage }}</div>
                    </div>

                    <!-- 确认决策 -->
                    <div v-else-if="e.type === 'tool_confirmation'" class="mt-1">
                      <div class="text-body-2">{{ e.toolName }} <code class="text-caption">{{ e.args }}</code></div>
                      <StatusChip :status="e.outcome === 'approve' ? 'ok' : 'cancelled'" :label-map="outcomeMap" />
                    </div>

                    <!-- 副作用（AI 实际创建/修改的记录） -->
                    <div v-else-if="e.type === 'effect'" class="mt-1">
                      <div class="d-flex align-center ga-2">
                        <span class="text-body-2">{{ e.toolName }}</span>
                        <StatusChip :status="e.effectStatus" :label-map="effectStatusMap" />
                      </div>
                      <div v-if="e.detail" class="text-body-2 text-medium-emphasis mt-1">{{ e.detail }}</div>
                      <v-btn
                        v-if="e.effect"
                        size="x-small"
                        variant="tonal"
                        color="warning"
                        class="mt-1"
                        :disabled="!e.effect.targetExists || e.effect.targetSoftDeleted"
                        @click="onRevoke(e.effect)"
                      >
                        {{ t('revoke') }} #{{ e.effect.resultId }}
                      </v-btn>
                    </div>

                    <!-- chat / error / navigate 摘要 -->
                    <div v-else-if="e.detail" class="text-body-2 text-medium-emphasis mt-1">{{ e.detail }}</div>
                    <div v-if="e.type === 'error' && e.errorMessage" class="text-body-2 text-error mt-1">{{ e.errorMessage }}</div>
                  </v-card-text>
                </v-card>
              </v-timeline-item>
            </v-timeline>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { aiToolsApi } from '@/api/aiTools'
import { formatTime } from '@/utils/format'
import type { AuditLog } from '@/types/audit'
import type { ToolEffect } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const userId = ref('')
const logs = ref<AuditLog[]>([])
const effects = ref<ToolEffect[]>([])
const loading = ref(false)

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
  effect?: ToolEffect
  effectStatus?: string
}

async function load() {
  loading.value = true
  try {
    const uid = userId.value ? Number(userId.value) : undefined
    const [logsRes, effRes] = await Promise.all([
      auditApi.logs({ userId: userId.value || undefined, limit: 100 }),
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

onMounted(load)
</script>

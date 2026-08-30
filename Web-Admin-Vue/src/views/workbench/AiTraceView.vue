<template>
  <div>
    <PageHeader :title="t('aiTraceTitle')" :subtitle="t('aiTraceHint')" />

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <el-select
          v-model="selectedId"
          :placeholder="t('aiTracePickConversation')"
          clearable
          filterable
          style="max-width: 420px"
          @update:model-value="onSelect"
        >
          <el-option v-for="c in conversationItems" :key="c.value" :label="c.title" :value="c.value" />
        </el-select>
        <el-button plain @click="loadConversations">
          <template #icon><AppIcon icon="mdi-refresh" /></template>
          {{ t('refresh') }}
        </el-button>
      </div>
    </el-card>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('aiTraceLoading') }}</div>

    <div v-else-if="loadError" class="text-error pa-4">{{ loadError }}</div>

    <div v-else-if="conversations.length === 0" class="text-medium-emphasis pa-4">{{ t('aiTraceNoConversation') }}</div>

    <template v-else-if="selectedId">
      <div v-if="traceLoading" class="text-medium-emphasis pa-4">{{ t('aiTraceLoading') }}</div>
      <div v-else-if="traceError" class="text-error pa-4">{{ traceError }}</div>
      <div v-else-if="steps.length === 0" class="text-medium-emphasis pa-4">{{ t('aiTraceEmpty') }}</div>

      <el-timeline v-else>
        <el-timeline-item
          v-for="s in steps"
          :key="s.id"
          :color="{ info: 'var(--el-color-info)', primary: 'var(--el-color-primary)', error: 'var(--el-color-danger)', success: 'var(--el-color-success)', warning: 'var(--el-color-warning)', grey: 'var(--el-text-color-placeholder)' }[stepColor(s)] ?? 'var(--el-color-primary)'"
        >
          <el-card shadow="never" class="mb-2">
            <div class="pa-1">
              <div class="d-flex justify-space-between align-center">
                <div class="d-flex align-center ga-1">
                  <!-- D1 Human-Agent-System：步骤来源标签（人 / AI / 系统）+ 子 agent 归责 -->
                  <el-tag size="small" :type="traceSourceTagType(traceSource(s.type))" effect="plain">{{ t(traceSourceKey(traceSource(s.type))) }}</el-tag>
                  <span v-if="s.agentId" class="text-caption text-medium-emphasis">· {{ s.agentId }}</span>
                  <span class="text-caption font-weight-medium" :class="stepColorClass(s)">
                    {{ stepLabel(s) }}
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">{{ formatTime(s.time) }}</span>
              </div>

              <!-- 输入 / AI 回复 -->
              <div v-if="s.type === 'input' || s.type === 'assistant'" class="mt-1 text-body-2">{{ s.content }}</div>

              <!-- 工具调用（业务语言；技术参数点击展开） -->
              <div v-else-if="s.type === 'tool_call'" class="mt-1">
                <div class="text-body-2">
                  <el-popover placement="top" :width="380" trigger="click">
                    <template #reference>
                      <span class="font-weight-medium" style="cursor:pointer;border-bottom:1px dashed #cbd5e1">
                        {{ toolLabel(tm('feature'), s.toolName) }}{{ toolArgsSummary(s.toolName, s.args, locale.startsWith('zh')) }}
                      </span>
                    </template>
                    <div class="text-caption">
                      <div class="mb-1 text-medium-emphasis">{{ formatTime(s.time) }}</div>
                      <div class="mb-2">
                        {{ toolLabel(tm('feature'), s.toolName) }}{{ toolArgsSummary(s.toolName, s.args, locale.startsWith('zh')) }}
                      </div>
                      <div class="text-medium-emphasis mb-1">{{ t('technicalDetail') }}</div>
                      <div class="mb-1"><b>{{ s.toolName }}</b></div>
                      <pre class="text-caption" style="white-space:pre-wrap;margin:0 0 6px">{{ s.args }}</pre>
                      <div v-if="s.errorMessage" class="text-error">{{ s.errorMessage }}</div>
                    </div>
                  </el-popover>
                </div>
                <StatusChip
                  :status="s.success ? 'ok' : 'cancelled'"
                  :label-map="{ ok: t('stepSuccess'), cancelled: t('stepFailed') }"
                  class="mt-1"
                />
                <div v-if="!s.success && s.errorMessage" class="text-body-2 text-error mt-1">{{ errorLabel(s.errorMessage, t) }}</div>
                <!-- W5-⑦ Explainable Authz：被拒工具的结构化检查清单（为何阻止） -->
                <div v-if="s.checks && s.checks.length" class="mt-1 pa-2" style="background: var(--el-fill-color-light); border-radius: 4px">
                  <div class="text-caption font-weight-medium text-medium-emphasis mb-1">{{ t('traceDeniedTitle') }}</div>
                  <div v-for="c in s.checks" :key="c.name" class="d-flex align-center ga-1 text-body-2">
                    <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="16" />
                    <span :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
                  </div>
                </div>
              </div>

              <!-- 写操作确认 -->
              <div v-else-if="s.type === 'confirmation'" class="mt-1">
                <div class="text-body-2">{{ toolLabel(tm('feature'), s.toolName) }}{{ toolArgsSummary(s.toolName, s.args, locale.startsWith('zh')) }}</div>
                <div class="mt-1">
                  <StatusChip :status="confirmStatus(s)" :label-map="confirmLabels" />
                  <span v-if="s.trusted" class="text-caption text-medium-emphasis ms-2">{{ t('stepTrusted') }}</span>
                </div>
              </div>

              <!-- 创建记录（副作用） -->
              <div v-else-if="s.type === 'effect' && s.effect" class="mt-1">
                <div class="text-body-2">{{ toolLabel(tm('feature'), s.toolName) }} → {{ s.effect.resultType }} #{{ s.effect.resultId }}</div>
                <div v-if="s.effect.targetTitle" class="text-body-2 text-medium-emphasis mt-1">{{ s.effect.targetTitle }}</div>
                <div v-if="s.effect.before || s.effect.after" class="mt-1">
                  <div class="text-caption text-medium-emphasis mb-1">{{ t('fieldChange') }}</div>
                  <FieldDiff :before="s.effect.before" :after="s.effect.after" />
                </div>
                <el-button
                  v-if="s.effect.revocable"
                  size="small"
                  plain
                  type="warning"
                  class="mt-1"
                  :loading="revokingId === s.effect.effectId"
                  @click="onRevokeEffect(s.effect)"
                >
                  {{ t('revokeEffect') }}
                </el-button>
              </div>

              <!-- 摘要类（chat/knowledge/error 等） -->
              <div v-else-if="s.type === 'notice'">
                <div v-if="s.detail" class="text-body-2 text-medium-emphasis mt-1">{{ s.detail }}</div>
                <div v-if="s.errorMessage" class="text-body-2 text-error mt-1">{{ errorLabel(s.errorMessage, t) }}</div>
              </div>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import StatusChip from '@/components/StatusChip.vue'
import FieldDiff from '@/components/FieldDiff.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiTraceApi } from '@/api/aiTrace'
import { formatTime } from '@/utils/format'
import { traceSource, traceSourceKey, traceSourceTagType } from '@/utils/traceSource'
import { toolLabel, toolArgsSummary, errorLabel } from '@/utils/businessLabel'
import type { ConversationSummary, TraceEffect, TraceStep } from '@/types/workbench'

const { t, tm, locale } = useI18n()
const snackbar = useSnackbarStore()

const conversations = ref<ConversationSummary[]>([])
const selectedId = ref<string | null>(null)
const steps = ref<TraceStep[]>([])
const loading = ref(false)
const traceLoading = ref(false)
const loadError = ref('')
const traceError = ref('')
const revokingId = ref<number | null>(null)

const confirmLabels = computed(() => ({
  ok: t('stepApproved'),
  cancelled: t('stepDeclined'),
  timeout: t('stepTimedOut'),
}))

function confirmStatus(s: TraceStep): string {
  if (s.outcome === 'approve') return 'ok'
  if (s.outcome === 'decline') return 'cancelled'
  return 'timeout'
}

/** 对话标题：取首条 user 消息（截断）或会话短 id */
function convTitle(c: ConversationSummary): string {
  const first = c.messages.find((m) => m.role === 'user' && m.content?.trim())
  if (first) return first.content.length > 40 ? `${first.content.slice(0, 40)}…` : first.content
  return t('conversation') + ' ' + (c.id.length > 10 ? `${c.id.slice(0, 10)}…` : c.id)
}

const conversationItems = computed(() =>
  conversations.value.map((c) => ({ title: convTitle(c), value: c.id })),
)

async function loadConversations() {
  loading.value = true
  loadError.value = ''
  try {
    conversations.value = await aiTraceApi.conversations()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

function onSelect() {
  steps.value = []
  traceError.value = ''
  if (selectedId.value) void loadTrace(selectedId.value)
}

async function loadTrace(id: string) {
  traceLoading.value = true
  traceError.value = ''
  try {
    const res = await aiTraceApi.trace(id)
    steps.value = res.steps
  } catch (err) {
    traceError.value = err instanceof Error ? err.message : t('loadFailed')
  } finally {
    traceLoading.value = false
  }
}

/** P0-15 本人撤销 AI 创建的记录，成功后重载轨迹（副作用步骤状态刷新） */
async function onRevokeEffect(effect: TraceEffect) {
  revokingId.value = effect.effectId
  try {
    await aiTraceApi.revokeEffect(effect.effectId)
    snackbar.success(t('aiTraceRevoked'))
    if (selectedId.value) await loadTrace(selectedId.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('aiTraceRevokeFailed'))
  } finally {
    revokingId.value = null
  }
}

function stepLabel(s: TraceStep): string {
  switch (s.type) {
    case 'input': return t('stepInput')
    case 'assistant': return t('stepAssistant')
    case 'tool_call': return t('stepToolCall')
    case 'confirmation': return t('stepConfirmation')
    case 'effect': return t('stepEffect')
    default: return t('stepNotice')
  }
}

/** D1 Human-Agent-System Accountability：来源分类复用 utils/traceSource */

function stepColor(s: TraceStep): string {
  switch (s.type) {
    case 'input': return 'info'
    case 'assistant': return 'primary'
    case 'tool_call': return s.success === false ? 'error' : 'primary'
    case 'confirmation': return s.outcome === 'approve' ? 'success' : 'warning'
    case 'effect': return 'success'
    default: return s.errorMessage ? 'error' : 'grey'
  }
}

function stepColorClass(s: TraceStep): string {
  const c = stepColor(s)
  if (c === 'error') return 'text-error'
  if (c === 'success') return 'text-success'
  if (c === 'warning') return 'text-warning'
  return 'text-primary'
}

onMounted(loadConversations)
</script>

<template>
  <div>
    <PageHeader :title="t('aiTraceTitle')" :subtitle="t('aiTraceHint')" />

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <v-select
          v-model="selectedId"
          :items="conversationItems"
          :label="t('aiTracePickConversation')"
          density="comfortable"
          variant="outlined"
          hide-details
          clearable
          style="max-width: 420px"
          @update:model-value="onSelect"
        />
        <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="loadConversations">{{ t('refresh') }}</v-btn>
      </v-card-text>
    </v-card>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('aiTraceLoading') }}</div>

    <div v-else-if="loadError" class="text-error pa-4">{{ loadError }}</div>

    <div v-else-if="conversations.length === 0" class="text-medium-emphasis pa-4">{{ t('aiTraceNoConversation') }}</div>

    <template v-else-if="selectedId">
      <div v-if="traceLoading" class="text-medium-emphasis pa-4">{{ t('aiTraceLoading') }}</div>
      <div v-else-if="traceError" class="text-error pa-4">{{ traceError }}</div>
      <div v-else-if="steps.length === 0" class="text-medium-emphasis pa-4">{{ t('aiTraceEmpty') }}</div>

      <v-timeline v-else side="end" density="compact" align="start">
        <v-timeline-item
          v-for="s in steps"
          :key="s.id"
          :dot-color="stepColor(s)"
          :icon="stepIcon(s)"
          size="small"
        >
          <v-card variant="outlined" class="mb-2">
            <v-card-text class="pa-3">
              <div class="d-flex justify-space-between align-center">
                <span class="text-caption font-weight-medium" :class="stepColorClass(s)">
                  {{ stepLabel(s) }}
                </span>
                <span class="text-caption text-medium-emphasis">{{ formatTime(s.time) }}</span>
              </div>

              <!-- 输入 / AI 回复 -->
              <div v-if="s.type === 'input' || s.type === 'assistant'" class="mt-1 text-body-2">{{ s.content }}</div>

              <!-- 工具调用 -->
              <div v-else-if="s.type === 'tool_call'" class="mt-1">
                <div class="text-body-2">{{ s.toolName }} <code class="text-caption">{{ s.args }}</code></div>
                <StatusChip
                  :status="s.success ? 'ok' : 'cancelled'"
                  :label-map="{ ok: t('stepSuccess'), cancelled: t('stepFailed') }"
                  class="mt-1"
                />
                <div v-if="!s.success && s.errorMessage" class="text-body-2 text-error mt-1">{{ s.errorMessage }}</div>
              </div>

              <!-- 写操作确认 -->
              <div v-else-if="s.type === 'confirmation'" class="mt-1">
                <div class="text-body-2">{{ s.toolName }} <code class="text-caption">{{ s.args }}</code></div>
                <div class="mt-1">
                  <StatusChip :status="confirmStatus(s)" :label-map="confirmLabels" />
                  <span v-if="s.trusted" class="text-caption text-medium-emphasis ml-2">{{ t('stepTrusted') }}</span>
                </div>
              </div>

              <!-- 创建记录（副作用） -->
              <div v-else-if="s.type === 'effect' && s.effect" class="mt-1">
                <div class="text-body-2">{{ s.toolName }} → {{ s.effect.resultType }} #{{ s.effect.resultId }}</div>
                <div v-if="s.effect.targetTitle" class="text-body-2 text-medium-emphasis mt-1">{{ s.effect.targetTitle }}</div>
              </div>

              <!-- 摘要类（chat/knowledge/error 等） -->
              <div v-else-if="s.type === 'notice'">
                <div v-if="s.detail" class="text-body-2 text-medium-emphasis mt-1">{{ s.detail }}</div>
                <div v-if="s.errorMessage" class="text-body-2 text-error mt-1">{{ s.errorMessage }}</div>
              </div>
            </v-card-text>
          </v-card>
        </v-timeline-item>
      </v-timeline>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatusChip from '@/components/StatusChip.vue'
import { aiTraceApi } from '@/api/aiTrace'
import { formatTime } from '@/utils/format'
import type { ConversationSummary, TraceStep } from '@/types/workbench'

const { t } = useI18n()

const conversations = ref<ConversationSummary[]>([])
const selectedId = ref<string | null>(null)
const steps = ref<TraceStep[]>([])
const loading = ref(false)
const traceLoading = ref(false)
const loadError = ref('')
const traceError = ref('')

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

function stepIcon(s: TraceStep): string {
  switch (s.type) {
    case 'input': return 'mdi-account-outline'
    case 'assistant': return 'mdi-robot-outline'
    case 'tool_call': return 'mdi-wrench-outline'
    case 'confirmation': return 'mdi-shield-check-outline'
    case 'effect': return 'mdi-content-save-outline'
    default: return 'mdi-message-outline'
  }
}

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

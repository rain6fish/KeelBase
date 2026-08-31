<template>
  <div>
    <PageHeader :title="t('workbenchActionDetail')" :subtitle="`${resultType} #${resultId}`">
      <el-button plain @click="goBack">
        <template #icon><AppIcon icon="mdi-arrow-left" /></template>
        {{ t('back') }}
      </el-button>
    </PageHeader>

    <div v-if="loading" class="text-medium-emphasis pa-6">{{ t('governanceLoading') }}</div>
    <div v-else-if="notFound" class="text-medium-emphasis pa-6">{{ t('governanceNoData') }}</div>
    <div v-else-if="loadError" class="text-error pa-6">{{ loadError }}</div>

    <template v-else-if="data">
      <!-- Hero：谁在何时，对什么做了什么，结果如何 —— 业务动作一句话 -->
      <el-card shadow="never" class="mb-4 action-hero">
        <div class="d-flex justify-space-between align-start flex-wrap ga-2">
          <div class="d-flex align-center ga-2">
            <el-tag :type="decisionBadge.type" effect="dark" size="large">{{ decisionBadge.text }}</el-tag>
            <span class="text-h6 font-weight-bold">{{ toolLabelText }}</span>
          </div>
          <el-tag type="primary" effect="plain">{{ data.effect.resultType }} #{{ data.effect.resultId }}</el-tag>
        </div>
        <div class="text-caption text-medium-emphasis mt-2">
          <code>{{ data.effect.toolName }}</code> · {{ t('governanceResult') }}
        </div>
        <el-divider class="my-3" />
        <div class="d-flex flex-wrap ga-4 text-body-2">
          <span class="d-flex align-center ga-1">
            <AppIcon icon="mdi-account-circle" size="18" color="var(--el-color-info)" />
            <strong class="text-medium-emphasis">{{ t('who') }}:</strong> {{ actorName }}
          </span>
          <span class="d-flex align-center ga-1">
            <AppIcon icon="mdi-clock-outline" size="18" color="var(--el-color-info)" />
            <strong class="text-medium-emphasis">{{ t('when') }}:</strong> {{ formatTime(data.effect.createdAt) }}
          </span>
        </div>
      </el-card>

      <!-- Why：双层 —— 用户视角人类语言 + 可展开技术详情 -->
      <el-card shadow="never" class="mb-4" :class="whyPanelClass">
        <template #header>
          <div class="d-flex align-center ga-2">
            <AppIcon icon="mdi-shield-check-outline" color="var(--el-color-primary)" />
            <span class="text-subtitle-1">{{ t('governanceWhy') }}</span>
          </div>
        </template>
        <div class="text-body-1 font-weight-medium">{{ whySummary }}</div>
        <div v-if="whyChecks.length" class="mt-2 pa-3" style="background: var(--el-fill-color-light); border-radius: 8px">
          <div class="text-caption font-weight-medium text-medium-emphasis mb-1">{{ t('techDetail') }}</div>
          <div v-for="c in whyChecks" :key="c.name" class="d-flex align-center ga-1 text-body-2">
            <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="16" />
            <span :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
          </div>
        </div>
      </el-card>

      <!-- 事实卡：副作用 / 完整性 -->
      <el-row :gutter="16" class="mb-4">
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="mb-4">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('sideEffects') }}</div>
            <div class="text-body-1 font-weight-medium">
              <AppIcon icon="mdi-database-check-outline" size="18" color="var(--el-color-success)" />
              {{ data.effect.conversationId ? t('governanceRecorded') : '-' }}
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="mb-4">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('governanceIntegrity') }}</div>
            <code class="text-caption">{{ data.effect.argsHash || '-' }}</code>
          </el-card>
        </el-col>
      </el-row>

      <!-- Human–Agent–System 决策轨迹（时间线即故事） -->
      <el-card shadow="never">
        <template #header>
          <div class="d-flex align-center ga-2">
            <AppIcon icon="mdi-account-multiple-outline" color="var(--el-color-primary)" />
            <span class="text-subtitle-1">{{ t('decisionTrace') }}</span>
          </div>
        </template>
        <div v-if="!steps.length" class="text-medium-emphasis text-body-2">{{ t('traceEmpty') }}</div>
        <el-timeline v-else>
          <el-timeline-item v-for="s in steps" :key="s.id" :color="timelineColor(s)">
            <div class="d-flex align-center ga-2 flex-wrap">
              <AppIcon :icon="sourceIcon(traceSource(s.type))" size="18" :color="sourceColor(traceSource(s.type))" />
              <el-tag size="small" :type="traceSourceTagType(traceSource(s.type))" effect="plain">{{ t(traceSourceKey(traceSource(s.type))) }}</el-tag>
              <span v-if="s.agentId" class="text-caption text-medium-emphasis">· {{ s.agentId }}</span>
              <span class="text-caption font-weight-medium text-primary">{{ stepLabel(s) }}</span>
              <span class="text-caption text-medium-emphasis" style="margin-left:auto">{{ formatTime(s.time) }}</span>
            </div>
            <div v-if="s.type === 'tool_call' || s.type === 'confirmation'" class="mt-1 text-body-2">
              <el-popover placement="top" :width="380" trigger="click">
                <template #reference>
                  <span style="cursor:pointer;border-bottom:1px dashed #cbd5e1">
                    {{ toolLabel(tm('feature'), s.toolName) }}{{ toolArgsSummary(s.toolName, s.args, locale.startsWith('zh')) }}
                  </span>
                </template>
                <div class="text-caption">
                  <div class="mb-1"><b>{{ s.toolName }}</b></div>
                  <pre class="text-caption" style="white-space:pre-wrap;margin:0">{{ s.args }}</pre>
                </div>
              </el-popover>
            </div>
            <div v-else-if="s.type === 'input' || s.type === 'assistant'" class="mt-1 text-body-2">{{ s.content }}</div>
            <div v-else-if="s.type === 'effect' && s.effect" class="mt-1 text-body-2">
              {{ toolLabel(tm('feature'), s.toolName) }} → {{ s.effect.resultType }} #{{ s.effect.resultId }}
            </div>
            <div v-if="s.errorMessage" class="mt-1 text-body-2 text-error">{{ errorLabel(s.errorMessage, t) }}</div>
            <div v-if="s.trusted" class="text-caption text-medium-emphasis mt-1">{{ t('stepTrusted') }}</div>
          </el-timeline-item>
        </el-timeline>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { aiToolsApi } from '@/api/aiTools'
import { ApiError } from '@/api/client'
import { formatTime } from '@/utils/format'
import { traceSource, traceSourceKey, traceSourceTagType, type TraceSource } from '@/utils/traceSource'
import { toolLabel } from '@/utils/toolLabel'
import { toolArgsSummary, errorLabel } from '@/utils/businessLabel'
import type { GovernanceActionResponse } from '@/types/admin'
import type { TraceStep } from '@/types/workbench'

const route = useRoute()
const router = useRouter()
const { t, tm, locale } = useI18n()
const auth = useAuthStore()

const resultType = String(route.params.resultType ?? '')
const resultId = Number(route.params.resultId)

const data = ref<GovernanceActionResponse | null>(null)
const loading = ref(false)
const loadError = ref('')
const notFound = ref(false)

const steps = computed<TraceStep[]>(() => (data.value?.trace as { steps?: TraceStep[] } | null)?.steps ?? [])

/** D2 人类语言工具标签（feature 命名空间 ai.tool.*），未命中回退原始名 */
const toolLabelText = computed(() => toolLabel(tm('feature') as Record<string, string> | undefined, data.value?.effect.toolName ?? ''))

/** Who：本人显示用户名，否则回退用户 id */
const actorName = computed(() => {
  if (!data.value) return ''
  const uid = data.value.effect.userId
  if (auth.user && String(auth.user.id) === uid) return auth.user.username
  return `#${uid}`
})

/** 决策徽章：批准 / 拒绝 / 阻止 / 允许（颜色随结果） */
const decisionBadge = computed<{ text: string; type: 'success' | 'danger' | 'warning' | 'info' }>(() => {
  const confirm = steps.value.find((s) => s.type === 'confirmation')
  if (confirm?.outcome === 'approve') return { text: t('stepApproved'), type: 'success' }
  if (confirm?.outcome === 'decline') return { text: t('stepDeclined'), type: 'danger' }
  if (confirm?.outcome === 'timeout') return { text: t('stepTimedOut'), type: 'warning' }
  const denied = steps.value.find((s) => s.type === 'tool_call' && s.success === false)
  if (denied) return { text: t('whyBlocked'), type: 'danger' }
  if (confirm?.trusted) return { text: t('stepTrusted'), type: 'info' }
  return { text: t('whyAllowed'), type: 'success' }
})

/** Why 面板背景色：确认=成功浅色 / 阻止拒绝=警示浅色 / 允许=中性 */
const whyPanelClass = computed(() => {
  const badge = decisionBadge.value
  if (badge.type === 'success') return 'why-panel-ok'
  if (badge.type === 'danger') return 'why-panel-bad'
  return 'why-panel-neutral'
})

/** Why 用户视角：确认结果 / 拒绝 / 信任上下文 人类语言 */
const whySummary = computed(() => {
  if (!data.value) return ''
  const confirm = steps.value.find((s) => s.type === 'confirmation')
  if (confirm?.outcome === 'approve') return t('whyConfirmed')
  if (confirm?.outcome === 'decline') return t('whyDeclined')
  const deniedTool = steps.value.find((s) => s.type === 'tool_call' && s.success === false)
  if (deniedTool?.checks?.length) return t('whyBlocked')
  if (confirm?.trusted) return t('stepTrusted')
  return t('whyAllowed')
})

/** Why 技术详情：被拒工具的结构化检查清单 */
const whyChecks = computed(() => {
  if (!data.value) return []
  const deniedTool = steps.value.find((s) => s.type === 'tool_call' && s.success === false)
  return deniedTool?.checks ?? []
})

/** 时间线来源图标/颜色：人 / AI / 系统 */
function sourceIcon(src: TraceSource): string {
  if (src === 'human') return 'mdi-account'
  if (src === 'agent') return 'mdi-robot-outline'
  return 'mdi-cog-outline'
}
function sourceColor(src: TraceSource): string {
  if (src === 'human') return 'var(--el-color-success)'
  if (src === 'agent') return 'var(--el-color-primary)'
  return 'var(--el-color-info)'
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

function timelineColor(s: TraceStep): string {
  switch (s.type) {
    case 'input': return 'var(--el-color-info)'
    case 'assistant': return 'var(--el-color-primary)'
    case 'tool_call': return s.success === false ? 'var(--el-color-danger)' : 'var(--el-color-primary)'
    case 'confirmation': return s.outcome === 'approve' ? 'var(--el-color-success)' : 'var(--el-color-warning)'
    case 'effect': return 'var(--el-color-success)'
    default: return s.errorMessage ? 'var(--el-color-danger)' : 'var(--el-text-color-placeholder)'
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/workbench')
}

async function load() {
  if (!resultType || !resultId) return
  loading.value = true
  loadError.value = ''
  notFound.value = false
  data.value = null
  try {
    data.value = await aiToolsApi.governanceAction(resultType, resultId)
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) {
      notFound.value = true
    } else {
      loadError.value = err instanceof Error ? err.message : t('governanceLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
</script>

<style scoped>
.action-hero {
  background: linear-gradient(135deg, var(--keel-brand-gradient-from, var(--el-color-primary)) 0%, var(--el-bg-color-page) 100%);
  border-radius: 12px;
}
.action-hero .el-card__body {
  padding: 20px;
}
.why-panel-ok {
  border-left: 4px solid var(--el-color-success);
}
.why-panel-bad {
  border-left: 4px solid var(--el-color-danger);
}
.why-panel-neutral {
  border-left: 4px solid var(--el-color-info);
}
</style>

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
      <!-- 七段：Who / When / What / Result / Side Effects / Integrity（Why 单独双层卡片） -->
      <el-row :gutter="16" class="mb-4">
        <el-col v-for="item in summaryItems" :key="item.label" :xs="24" :sm="12" :md="8">
          <el-card shadow="never" class="mb-4">
            <div class="text-caption text-medium-emphasis mb-1">{{ item.label }}</div>
            <div class="text-body-1 font-weight-medium" :class="{ 'text-break-all': item.mono }">
              <code v-if="item.mono" class="text-caption">{{ item.value }}</code>
              <template v-else>{{ item.value }}</template>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- Why：用户视角 + 技术详情 双层 -->
      <el-card shadow="never" class="mb-4">
        <template #header>{{ t('governanceWhy') }}</template>
        <div class="text-body-2">{{ whySummary }}</div>
        <div v-if="whyChecks.length" class="mt-2 pa-3" style="background: var(--el-fill-color-light); border-radius: 8px">
          <div class="text-caption font-weight-medium text-medium-emphasis mb-1">{{ t('techDetail') }}</div>
          <div v-for="c in whyChecks" :key="c.name" class="d-flex align-center ga-1 text-body-2">
            <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="16" />
            <span :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
          </div>
        </div>
      </el-card>

      <!-- Human–Agent–System 决策轨迹 -->
      <el-card shadow="never">
        <template #header>{{ t('decisionTrace') }}</template>
        <div v-if="!steps.length" class="text-medium-emphasis text-body-2">{{ t('traceEmpty') }}</div>
        <el-timeline v-else>
          <el-timeline-item v-for="s in steps" :key="s.id" :color="timelineColor(s)">
            <div class="d-flex align-center ga-1">
              <el-tag size="small" :type="traceSourceTagType(traceSource(s.type))" effect="plain">{{ t(traceSourceKey(traceSource(s.type))) }}</el-tag>
              <span v-if="s.agentId" class="text-caption text-medium-emphasis">· {{ s.agentId }}</span>
              <span class="text-caption font-weight-medium text-primary">{{ stepLabel(s) }}</span>
            </div>
            <div v-if="s.type === 'tool_call' || s.type === 'confirmation'" class="mt-1 text-body-2">
              {{ s.toolName }} <code class="text-caption">{{ s.args }}</code>
            </div>
            <div v-else-if="s.type === 'input' || s.type === 'assistant'" class="mt-1 text-body-2">{{ s.content }}</div>
            <div v-else-if="s.type === 'effect' && s.effect" class="mt-1 text-body-2">
              {{ s.toolName }} → {{ s.effect.resultType }} #{{ s.effect.resultId }}
            </div>
            <div v-if="s.errorMessage" class="mt-1 text-body-2 text-error">{{ s.errorMessage }}</div>
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
import { traceSource, traceSourceKey, traceSourceTagType } from '@/utils/traceSource'
import type { GovernanceActionResponse } from '@/types/admin'
import type { TraceStep } from '@/types/workbench'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const auth = useAuthStore()

const resultType = String(route.params.resultType ?? '')
const resultId = Number(route.params.resultId)

const data = ref<GovernanceActionResponse | null>(null)
const loading = ref(false)
const loadError = ref('')
const notFound = ref(false)

const steps = computed<TraceStep[]>(() => (data.value?.trace as { steps?: TraceStep[] } | null)?.steps ?? [])

/** Who：本人显示用户名，否则回退用户 id */
const actorName = computed(() => {
  if (!data.value) return ''
  const uid = data.value.effect.userId
  if (auth.user && String(auth.user.id) === uid) return auth.user.username
  return `#${uid}`
})

/** 七段摘要卡（Why 单独双层卡片） */
const summaryItems = computed(() => {
  if (!data.value) return []
  const e = data.value.effect
  return [
    { label: t('who'), value: actorName.value, mono: false },
    { label: t('when'), value: formatTime(e.createdAt), mono: false },
    { label: t('what'), value: e.toolName, mono: true },
    { label: t('governanceResult'), value: `${e.resultType} #${e.resultId}`, mono: false },
    { label: t('sideEffects'), value: e.conversationId ? t('governanceRecorded') : '-', mono: false },
    { label: t('governanceIntegrity'), value: e.argsHash || '-', mono: true },
  ]
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

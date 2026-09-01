<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-drawer
    :model-value="modelValue"
    size="520px"
    :title="t('governanceDetail')"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('governanceLoading') }}</div>
    <!-- 404 = 该业务动作无 AI 副作用记录（可能为人工创建） -->
    <div v-else-if="notFound" class="text-medium-emphasis pa-4">{{ t('governanceNoData') }}</div>
    <div v-else-if="loadError" class="text-error pa-4">{{ loadError }}</div>

    <template v-else-if="data">
      <!-- D1 七段：Who / When / What / Why / Result / Side Effects / Integrity -->
      <div class="d-flex flex-column ga-1">
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('who') }}</span>
          <span class="text-body-2">{{ actorName }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('when') }}</span>
          <span class="text-body-2">{{ formatTime(data.effect.createdAt) }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('what') }}</span>
          <span class="text-body-2">{{ toolLabel(tm('feature'), data.effect.toolName) }}</span>
        </div>

        <!-- Why：两层（用户视角 + 技术详情） -->
        <div class="mb-1">
          <div class="text-caption text-medium-emphasis mb-1">{{ t('governanceWhy') }}</div>
          <div class="text-body-2">{{ whySummary }}</div>
          <div v-if="whyChecks.length" class="mt-1 pa-2" style="background: var(--el-fill-color-light); border-radius: 4px">
            <div class="text-caption font-weight-medium text-medium-emphasis mb-1">{{ t('authzBasis') }}</div>
            <div v-for="c in whyChecks" :key="c.name" class="d-flex align-center ga-1 text-body-2">
              <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="16" />
              <span :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
            </div>
          </div>
        </div>

        <!-- A-5 身份链：Human → Agent → Tool → Business Action（谁发起→谁执行→哪个工具→业务动作） -->
        <div class="mb-2">
          <div class="text-caption text-medium-emphasis mb-1">{{ t('identityChain') }}</div>
          <div class="d-flex align-center flex-wrap" style="gap:6px">
            <el-tag size="small" effect="plain" type="primary">{{ actorName }}</el-tag>
            <AppIcon icon="mdi-arrow-right" size="14" />
            <el-tooltip v-if="businessIntent" :content="businessIntent" placement="top">
              <el-tag size="small" effect="plain" type="warning" class="intent-tag">{{ t('businessIntent') }}</el-tag>
            </el-tooltip>
            <template v-if="businessIntent"><AppIcon icon="mdi-arrow-right" size="14" /></template>
            <el-tag v-if="agentName" size="small" effect="plain" type="info">{{ agentName }}</el-tag>
            <AppIcon v-if="agentName" icon="mdi-arrow-right" size="14" />
            <el-tag size="small" effect="plain">{{ toolLabel(tm('feature'), data.effect.toolName) }}</el-tag>
            <AppIcon icon="mdi-arrow-right" size="14" />
            <el-tag size="small" type="success" effect="dark">{{ t('businessAction') }}</el-tag>
          </div>
        </div>

        <!-- A-3 生命周期状态机：这件事现在到哪一步 -->
        <div v-if="lifecycleState" class="mb-2">
          <div class="text-caption text-medium-emphasis mb-1">{{ t('lifecycle') }}</div>
          <el-tag size="small" :type="lifecycleTag(lifecycleState)" effect="dark">{{ lifecycleLabel(lifecycleState) }}</el-tag>
        </div>

        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('governanceResult') }}</span>
          <span class="text-body-2">{{ data.effect.resultType }} #{{ data.effect.resultId }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('sideEffects') }}</span>
          <span class="text-body-2">{{ data.effect.conversationId ? t('governanceRecorded') : '-' }}</span>
        </div>
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('governanceIntegrity') }}</span>
          <code class="text-caption">{{ data.effect.argsHash || '-' }}</code>
        </div>
      </div>

      <div class="text-center mt-2">
        <el-button size="small" plain @click="goFullPage">
          <template #icon><AppIcon icon="mdi-arrow-expand" /></template>
          {{ t('viewFullTrace') }}
        </el-button>
      </div>

      <el-divider />

      <!-- Human-Agent-System 决策轨迹 -->
      <div class="text-body-2 font-weight-medium mb-2">{{ t('decisionTrace') }}</div>
      <div v-if="!steps.length" class="text-medium-emphasis text-body-2">{{ t('traceEmpty') }}</div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="s in steps"
          :key="s.id"
          :color="timelineColor(s)"
        >
          <div class="d-flex align-center ga-1">
            <el-tag size="small" :type="traceSourceTagType(traceSource(s.type))" effect="plain">{{ t(traceSourceKey(traceSource(s.type))) }}</el-tag>
            <span v-if="s.agentId" class="text-caption text-medium-emphasis">· {{ s.agentId }}</span>
            <span class="text-caption font-weight-medium text-primary">{{ stepLabel(s) }}</span>
          </div>
          <div v-if="s.type === 'tool_call' || s.type === 'confirmation'" class="mt-1 text-body-2">
            <el-popover placement="top" :width="360" trigger="click">
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
          <div v-else-if="s.type === 'effect' && s.effect" class="mt-1">
            <div class="text-body-2">{{ toolLabel(tm('feature'), s.toolName) }} → {{ s.effect.resultType }} #{{ s.effect.resultId }}</div>
            <div v-if="s.effect.before || s.effect.after" class="mt-1">
              <div class="text-caption text-medium-emphasis mb-1">{{ t('fieldChange') }}</div>
              <FieldDiff :before="s.effect.before" :after="s.effect.after" />
            </div>
          </div>
          <div v-if="s.errorMessage" class="mt-1 text-body-2 text-error">{{ errorLabel(s.errorMessage, t) }}</div>
          <div v-if="s.trusted" class="text-caption text-medium-emphasis mt-1">{{ t('stepTrusted') }}</div>
        </el-timeline-item>
      </el-timeline>
    </template>

    <div v-else class="text-medium-emphasis pa-4">{{ t('governanceNoData') }}</div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import FieldDiff from '@/components/FieldDiff.vue'
import { useAuthStore } from '@/stores/auth'
import { aiToolsApi } from '@/api/aiTools'
import { ApiError } from '@/api/client'
import { formatTime } from '@/utils/format'
import { traceSource, traceSourceKey, traceSourceTagType } from '@/utils/traceSource'
import { toolLabel, toolArgsSummary, errorLabel } from '@/utils/businessLabel'
import type { GovernanceActionResponse } from '@/types/admin'
import type { TraceStep } from '@/types/workbench'

const props = defineProps<{ modelValue: boolean; resultType: string; resultId: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t, tm, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const data = ref<GovernanceActionResponse | null>(null)
const loading = ref(false)
const loadError = ref('')
const notFound = ref(false)

const steps = computed<TraceStep[]>(() => (data.value?.trace as { steps?: TraceStep[] } | null)?.steps ?? [])

/** Who 用户视角：本人显示用户名，否则回退用户 id */
const actorName = computed(() => {
  if (!data.value) return ''
  const uid = data.value.effect.userId
  if (auth.user && String(auth.user.id) === uid) return auth.user.username
  return `#${uid}`
})

/** A-5 身份链：Agent 名（从决策轨迹步骤取非空 agentId；无子 agent 时空，身份链退化为 Human→Tool→Action） */
const agentName = computed(() => steps.value.find((s) => s.agentId)?.agentId ?? '')

/** A-5 身份链：Intent（业务意图 = 首个用户请求；补全 Human→Intent→Agent→Tool→Action） */
const businessIntent = computed(() => steps.value.find((s) => s.type === 'input' && s.content?.trim())?.content?.trim() ?? '')

/** A-3 生命周期状态机：从决策轨迹推导「这件事现在到哪一步」 */
const lifecycleState = computed(() => {
  if (!data.value) return ''
  const effect = data.value.effect as { targetSoftDeleted?: boolean }
  if (effect.targetSoftDeleted) return 'revoked'
  const confirm = steps.value.find((s) => s.type === 'confirmation')
  if (confirm?.outcome === 'decline') return 'declined'
  const denied = steps.value.find((s) => s.type === 'tool_call' && s.success === false)
  if (denied) return 'blocked'
  if (confirm?.outcome === 'approve') return 'confirmed'
  return 'executed'
})
const lifecycleLabel = (s: string) =>
  ({ revoked: t('lifecycleRevoked'), declined: t('lifecycleDeclined'), blocked: t('lifecycleBlocked'), confirmed: t('lifecycleConfirmed'), executed: t('lifecycleExecuted') })[s] ?? ''
const lifecycleTag = (s: string) =>
  ({ revoked: 'danger', declined: 'danger', blocked: 'warning', confirmed: 'success', executed: 'success' })[s] ?? 'info'

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

/** A-5 授权依据：本次操作的授权链检查清单（放行 = 为什么允许；拒绝 = 为什么阻止；取首个工具步骤） */
const whyChecks = computed(() => {
  if (!data.value) return []
  const toolStep = steps.value.find((s) => s.type === 'tool_call')
  return toolStep?.checks ?? []
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

async function load() {
  if (!props.resultType || !props.resultId) return
  loading.value = true
  loadError.value = ''
  notFound.value = false
  data.value = null
  try {
    data.value = await aiToolsApi.governanceAction(props.resultType, props.resultId)
  } catch (err) {
    // 404 = 该业务动作无 AI 副作用记录（人工创建）→ 友好空态；其他错误显示信息
    if (err instanceof ApiError && err.statusCode === 404) {
      notFound.value = true
    } else {
      loadError.value = err instanceof Error ? err.message : t('governanceLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

// 展开到工作台用户侧独立 Action Detail 页面（P0·产品证明 Business Action Trace）
function goFullPage() {
  void router.push({
    name: 'workbench-action-detail',
    params: { resultType: props.resultType, resultId: props.resultId },
  })
}

// 抽屉打开时加载治理数据；目标变化时若已打开则刷新（重试/切换业务动作场景）
watch(() => props.modelValue, (open) => {
  if (open) void load()
})
watch([() => props.resultType, () => props.resultId], () => {
  if (props.modelValue) void load()
})
// 挂载时已打开（父组件先置 open 再渲染本组件）→ 直接加载
onMounted(() => {
  if (props.modelValue) void load()
})
</script>

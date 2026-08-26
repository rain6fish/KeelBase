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
          <span class="text-body-2">{{ data.effect.toolName }}</span>
        </div>

        <!-- Why：两层（用户视角 + 技术详情） -->
        <div class="mb-1">
          <div class="text-caption text-medium-emphasis mb-1">{{ t('governanceWhy') }}</div>
          <div class="text-body-2">{{ whySummary }}</div>
          <div v-if="whyChecks.length" class="mt-1 pa-2" style="background: var(--el-fill-color-light); border-radius: 4px">
            <div class="text-caption font-weight-medium text-medium-emphasis mb-1">{{ t('techDetail') }}</div>
            <div v-for="c in whyChecks" :key="c.name" class="d-flex align-center ga-1 text-body-2">
              <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="16" />
              <span :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
            </div>
          </div>
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
    </template>

    <div v-else class="text-medium-emphasis pa-4">{{ t('governanceNoData') }}</div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { aiToolsApi } from '@/api/aiTools'
import { ApiError } from '@/api/client'
import { formatTime } from '@/utils/format'
import { traceSource, traceSourceKey, traceSourceTagType } from '@/utils/traceSource'
import type { GovernanceActionResponse } from '@/types/admin'
import type { TraceStep } from '@/types/workbench'

const props = defineProps<{ modelValue: boolean; resultType: string; resultId: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t } = useI18n()
const auth = useAuthStore()

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

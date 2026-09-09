<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('trustSandboxTitle')" :subtitle="t('trustSandboxSubtitle')">
      <el-button :loading="cleaning" text type="danger" @click="confirmCleanup">
        <AppIcon icon="mdi-broom" class="mr-1" />{{ t('sandboxCleanup') }}
      </el-button>
      <el-button type="primary" :loading="journeyLoading" @click="startJourney">
        <AppIcon icon="mdi-play" class="mr-1" />{{ t('trustJourneyStart') }}
      </el-button>
    </PageHeader>

    <div v-if="journeyStatLine" class="text-caption text-medium-emphasis mb-2">{{ journeyStatLine }}</div>
    <div v-if="journeyServerLine" class="text-caption text-medium-emphasis mb-2">{{ journeyServerLine }}</div>

    <el-alert type="info" :closable="false" class="mb-4">
      {{ t('trustSandboxIntro') }}
    </el-alert>

    <!-- 六场景整行栅格：点「运行演示」→ 运行结果用弹窗展示（替代原右侧常驻面板） -->
    <el-row :gutter="16">
      <el-col v-for="s in scenarios" :key="s.id" :xs="24" :sm="12" :lg="8">
        <el-card class="h-100 mb-4" shadow="hover">
          <template #header>
            <div class="d-flex align-center justify-space-between ga-2">
              <span class="d-flex align-center ga-2 text-h6">
                <AppIcon :icon="s.icon" />
                {{ t(`tsScenario.${s.id}.title`) }}
              </span>
              <el-tag size="small" :type="s.tag">{{ t('trustSandboxScenario') }}</el-tag>
            </div>
          </template>
          <p class="text-body-2 text-medium-emphasis mb-3">{{ t(`tsScenario.${s.id}.desc`) }}</p>
          <el-button type="primary" plain :loading="running === s.id" :disabled="!!running && running !== s.id" @click="run(s.id)">
            <AppIcon icon="mdi-play-circle-outline" class="mr-1" />{{ t('runDemo') }}
          </el-button>
        </el-card>
      </el-col>
    </el-row>

    <!-- 单场景结果弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      width="540px"
      :title="t('trustSandboxResult')"
      class="ts-result-dialog"
      :close-on-click-modal="false"
    >
      <template v-if="result">
        <div class="d-flex align-center justify-space-between mb-3">
          <span class="d-flex align-center ga-2 text-h6">
            <AppIcon :icon="scenarioIcon(result.scenario)" />
            {{ t(`tsScenario.${result.scenario}.title`) }}
          </span>
          <el-tag :type="outcomeTag(result.outcome)" effect="dark">
            {{ t(`tsOutcome.${result.outcome}`) }}
          </el-tag>
        </div>
        <p class="tsd-detail mb-3">{{ result.detail || '—' }}</p>
        <div v-if="result.governed && result.resultType && result.resultId" class="mb-2">
          <el-button size="small" type="primary" text @click="openAction(result)">
            <AppIcon icon="mdi-creation-outline" class="mr-1" />{{ t('trustSandboxViewAction') }}
          </el-button>
        </div>
        <div v-if="result.conversationId" class="d-flex align-center justify-space-between flex-wrap gap-2 text-body-2 text-medium-emphasis">
          <span class="d-flex align-center">
            <AppIcon icon="mdi-robot-outline" class="mr-1" />{{ t('trustSandboxConvHint') }}
          </span>
          <el-button size="small" text type="primary" @click="openTrace(result)">
            <AppIcon icon="mdi-timeline-clock-outline" class="mr-1" />{{ t('trustSandboxViewTrace') }}
          </el-button>
        </div>
      </template>
      <template #footer>
        <el-button type="primary" plain @click="dialogVisible = false">{{ t('trustSandboxDialogClose') }}</el-button>
      </template>
    </el-dialog>

    <!-- P0-2 旅程一键连跑弹窗：Ask→人工确认→越权拒绝→高风险阻断，自动逐条推进、可跳过动画 -->
    <el-dialog
      v-model="journeyVisible"
      width="680px"
      :title="t('trustJourneyTitle')"
      class="ts-result-dialog"
      :close-on-click-modal="false"
      @closed="clearJourneyTimers"
    >
      <template v-if="journeySteps.length">
        <p class="text-body-2 text-medium-emphasis mb-3">{{ t('trustJourneySubtitle') }}</p>
        <el-progress :percentage="journeyProgress" :stroke-width="6" :status="journeyDone ? 'success' : undefined" class="mb-3" />
        <div class="d-flex flex-column ga-2">
          <div v-for="(st, idx) in journeySteps" v-show="idx < journeyRevealed" :key="st.scenario" class="ts-journey-step">
            <div class="d-flex align-center ga-2 mb-1 flex-wrap">
              <AppIcon :icon="journeyMeta(st.step).icon" size="20" color="var(--el-color-primary)" />
              <span class="text-subtitle-1">{{ t(journeyMeta(st.step).labelKey) }}</span>
              <el-tag :type="outcomeTag(st.outcome)" effect="dark" size="small">{{ t(`tsOutcome.${st.outcome}`) }}</el-tag>
            </div>
            <div class="text-h6 mb-2">{{ t(`tsScenario.${st.scenario}.title`) }}</div>
            <!-- Powered by：这一步靠哪个运行时机制保证（Story→Capability） -->
            <div v-if="capabilitiesFor(st.scenario).length" class="d-flex align-center ga-1 flex-wrap mb-1">
              <el-tag v-for="cap in capabilitiesFor(st.scenario)" :key="cap.labelKey" size="small" type="info" effect="plain">
                <AppIcon :icon="cap.icon" class="mr-1" />{{ t(cap.labelKey) }}
              </el-tag>
            </div>
            <p class="tsd-detail mb-2">{{ st.detail || '—' }}</p>
          </div>
        </div>

        <!-- P1-1 从看到做：确定性命门证明之外，引导真实 Copilot 批准→落库→撤销→看证据 -->
        <div v-if="journeyDone && journeyCreateTarget" class="ts-create-guide mt-3">
          <el-divider />
          <div class="d-flex align-center ga-2 mb-1">
            <AppIcon icon="mdi-creation-outline" color="var(--el-color-success)" />
            <span class="text-subtitle-1">{{ t('createGuideTitle') }}</span>
          </div>
          <p class="text-body-2 text-medium-emphasis mb-3">{{ t('createGuideBody') }}</p>
          <div class="d-flex align-center ga-2 flex-wrap">
            <el-button type="success" plain @click="openCreateLive">
              <AppIcon icon="mdi-robot-happy-outline" class="mr-1" />{{ t('createGuideStart') }}
            </el-button>
            <el-button @click="goMyAiActions">
              <AppIcon icon="mdi-creation-outline" class="mr-1" />{{ t('createGuideActions') }}
            </el-button>
          </div>
        </div>
      </template>
      <div v-else class="text-body-2 text-medium-emphasis pa-3">{{ t('loading') }}</div>

      <template #footer>
        <div class="d-flex align-center justify-space-between flex-wrap gap-2">
          <span v-if="journeySteps.length && !journeyDone" class="d-flex align-center ga-2">
            <el-button size="small" text type="primary" :disabled="journeyLoading" @click="skipJourney">
              <AppIcon icon="mdi-fast-forward" class="mr-1" />{{ t('journeySkip') }}
            </el-button>
            <span class="text-caption text-medium-emphasis">{{ journeyRevealed }}/{{ journeySteps.length }}</span>
          </span>
          <span v-else-if="journeySteps.length && journeyDone" class="text-caption text-medium-emphasis">{{ t('journeyDone') }}</span>
          <span v-else />
          <span class="d-flex align-center ga-2 flex-wrap">
            <el-button v-if="journeyDone" @click="restartJourney">
              <AppIcon icon="mdi-refresh" class="mr-1" />{{ t('journeyReplay') }}
            </el-button>
            <el-button v-if="journeyDone && journeyAction" type="primary" plain @click="openJourneyAction">
              <AppIcon icon="mdi-creation-outline" class="mr-1" />{{ t('trustSandboxViewAction') }}
            </el-button>
            <el-button v-if="journeyDone && journeyTrace" type="primary" @click="openJourneyTrace">
              <AppIcon icon="mdi-timeline-clock-outline" class="mr-1" />{{ t('trustSandboxViewTrace') }}
            </el-button>
            <el-button @click="closeJourney">{{ t('trustSandboxDialogClose') }}</el-button>
          </span>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'
import { aiApi, type TrustSandboxJourneyStep, type TrustSandboxRunResult } from '@/api/ai'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const scenarios = [
  { id: 's1_normal', icon: 'mdi-chart-box-outline', tag: 'success' },
  { id: 's2_denied', icon: 'mdi-shield-lock-outline', tag: 'warning' },
  { id: 's3_r5_block', icon: 'mdi-shield-alert-outline', tag: 'danger' },
  { id: 's4_confirm', icon: 'mdi-hand-okay', tag: 'primary' },
  { id: 's5_revoke', icon: 'mdi-undo', tag: 'info' },
  { id: 's6_java', icon: 'mdi-language-java', tag: 'info' },
]

const running = ref('')
const result = ref<TrustSandboxRunResult | null>(null)
const dialogVisible = ref(false)

// —— P0-2 旅程一键连跑状态 ——
const JOURNEY_REVEAL_MS = 900
const journeyVisible = ref(false)
const journeyLoading = ref(false)
const cleaning = ref(false)
const journeySteps = ref<TrustSandboxJourneyStep[]>([])
const journeyRevealed = ref(0)
let journeyTimer: number | undefined

// P2 轻埋点：旅程完成度（本机 localStorage 计数，非跨访客聚合）
interface JourneyStats {
  started: number
  completed: number
}
function readJourneyStats(): JourneyStats {
  try {
    const raw = storage.get(STORAGE_KEYS.TRUST_JOURNEY_STATS)
    if (raw) {
      const p = JSON.parse(raw) as Partial<JourneyStats>
      return { started: Number(p.started) || 0, completed: Number(p.completed) || 0 }
    }
  } catch {
    /* 解析失败视为无统计 */
  }
  return { started: 0, completed: 0 }
}
const journeyStats = ref<JourneyStats>(readJourneyStats())
const journeyStatLine = computed(() =>
  journeyStats.value.completed > 0 ? t('journeyStats', { n: journeyStats.value.completed }) : '',
)
// P2 ③ 跨访客：服务器聚合的旅程完成统计（今日 / 累计）
const serverStats = ref<{ today: number; total: number }>({ today: 0, total: 0 })
const journeyServerLine = computed(() =>
  serverStats.value.total > 0
    ? t('journeyServerStats', { t: serverStats.value.today, n: serverStats.value.total })
    : '',
)
function persistJourneyStats() {
  storage.set(STORAGE_KEYS.TRUST_JOURNEY_STATS, JSON.stringify(journeyStats.value))
}
function bumpJourneyStarted() {
  journeyStats.value.started++
  persistJourneyStats()
}
function bumpJourneyCompleted() {
  journeyStats.value.completed++
  persistJourneyStats()
}

function outcomeTag(o: TrustSandboxRunResult['outcome']) {
  return ({ passed: 'success', check: 'warning', guide: 'info', unknown: 'info' } as Record<string, string>)[o] ?? 'info'
}

function scenarioIcon(id: string) {
  return scenarios.find((s) => s.id === id)?.icon ?? 'mdi-bullseye'
}

async function run(id: string) {
  // 1.0.8 deferred：s5 撤销会命中真实 AI 副作用——运行前先经弹窗确认（不静默撤销）
  if (id === 's5_revoke') {
    try {
      await ElMessageBox.confirm(t('s5RevokeConfirm'), t('trustSandboxScenario'), {
        type: 'warning',
        confirmButtonText: t('runDemo'),
        cancelButtonText: t('cancel'),
      })
    } catch {
      return // 取消：不执行撤销
    }
  }
  running.value = id
  try {
    result.value = await aiApi.trustSandboxRun(id, { confirm: id === 's5_revoke' })
    dialogVisible.value = true
  } catch (err) {
    ElMessage.error(err instanceof Error && err.message ? err.message : t('loadFailed'))
  } finally {
    running.value = ''
  }
}

function openAction(r: TrustSandboxRunResult) {
  dialogVisible.value = false
  router.push(`/workbench/action/${r.resultType}/${r.resultId}`)
}

/** 直达该会话的 AI 执行轨迹（AiTraceView 支持 ?conv= 深链自动定位） */
function openTrace(r: TrustSandboxRunResult) {
  if (!r.conversationId) return
  dialogVisible.value = false
  router.push(`/workbench/ai-trace?conv=${r.conversationId}`)
}

// —— P0-2 旅程：一键连跑 + 自动逐条推进 ——
const JOURNEY_META: Record<TrustSandboxJourneyStep['step'], { icon: string; labelKey: string }> = {
  ask: { icon: 'mdi-chart-box-outline', labelKey: 'journeyStepAsk' },
  act: { icon: 'mdi-hand-okay', labelKey: 'journeyStepAct' },
  break_deny: { icon: 'mdi-shield-lock-outline', labelKey: 'journeyStepDeny' },
  break_block: { icon: 'mdi-shield-alert-outline', labelKey: 'journeyStepBlock' },
}

function journeyMeta(step: TrustSandboxJourneyStep['step']) {
  return JOURNEY_META[step] ?? JOURNEY_META.ask
}

/** Powered by：每步 outcome 由哪个运行时机制保证（Story→Capability） */
const CAPABILITY: Record<string, Array<{ icon: string; labelKey: string }>> = {
  s1_normal: [
    { icon: 'mdi-account-lock-outline', labelKey: 'capOwnScope' },
    { icon: 'mdi-timeline-clock-outline', labelKey: 'capTrace' },
  ],
  s2_denied: [{ icon: 'mdi-account-key-outline', labelKey: 'capCasl' }],
  s3_r5_block: [{ icon: 'mdi-shield-alert-outline', labelKey: 'capRiskPolicy' }],
  s4_confirm: [{ icon: 'mdi-hand-okay', labelKey: 'capHumanApproval' }],
}
function capabilitiesFor(scenario: string) {
  return CAPABILITY[scenario] ?? []
}

const journeyDone = computed(() => journeySteps.value.length > 0 && journeyRevealed.value >= journeySteps.value.length)
const journeyProgress = computed(() =>
  journeySteps.value.length ? Math.round((journeyRevealed.value / journeySteps.value.length) * 100) : 0,
)
/** 结尾 CTA：执行轨迹（取 ask 留痕，缺失时回退任一 conversation） */
const journeyTrace = computed(() => journeySteps.value.find((s) => s.conversationId)?.conversationId)
const journeyAction = computed(() => {
  const ask = journeySteps.value.find((s) => s.step === 'ask')
  return ask?.governed && ask?.resultType && ask.resultId ? { resultType: ask.resultType, resultId: ask.resultId } : null
})
/** P1-1：旅程 ask 步刚建的沙盘客户（crm_customer）作为「真实落库」目标 */
const journeyCreateTarget = computed(() => {
  const ask = journeySteps.value.find((s) => s.step === 'ask')
  return ask?.resultType === 'crm_customer' && ask.resultId ? ask.resultId : null
})

function clearJourneyTimers() {
  if (journeyTimer !== undefined) {
    window.clearInterval(journeyTimer)
    journeyTimer = undefined
  }
}

function beginReveal() {
  clearJourneyTimers()
  journeyRevealed.value = Math.min(1, journeySteps.value.length)
  if (journeySteps.value.length > 1) {
    journeyTimer = window.setInterval(() => {
      if (journeyRevealed.value < journeySteps.value.length) {
        journeyRevealed.value++
      } else {
        clearJourneyTimers()
      }
    }, JOURNEY_REVEAL_MS)
  }
}

async function startJourney() {
  if (journeyLoading.value) return
  journeyLoading.value = true
  clearJourneyTimers()
  journeySteps.value = []
  journeyRevealed.value = 0
  bumpJourneyStarted()
  try {
    const res = await aiApi.trustSandboxJourney()
    journeySteps.value = res.steps
    journeyVisible.value = true
    beginReveal()
  } catch (err) {
    ElMessage.error(err instanceof Error && err.message ? err.message : t('loadFailed'))
  } finally {
    journeyLoading.value = false
  }
}

function restartJourney() {
  void startJourney()
}

function skipJourney() {
  clearJourneyTimers()
  journeyRevealed.value = journeySteps.value.length
}

function closeJourney() {
  journeyVisible.value = false
  clearJourneyTimers()
}

function openJourneyTrace() {
  if (!journeyTrace.value) return
  journeyVisible.value = false
  router.push(`/workbench/ai-trace?conv=${journeyTrace.value}`)
}

function openJourneyAction() {
  if (!journeyAction.value) return
  journeyVisible.value = false
  router.push(`/workbench/action/${journeyAction.value.resultType}/${journeyAction.value.resultId}`)
}

/** P1-1：跳刚建沙盘客户详情并自动唤起真实 AI Copilot（批准→真落库） */
function openCreateLive() {
  if (!journeyCreateTarget.value) return
  journeyVisible.value = false
  router.push(`/workbench/crm/${journeyCreateTarget.value}?ai=1`)
}

/** P1-1：到「我的 AI 行为」撤销 / 看证据 */
function goMyAiActions() {
  journeyVisible.value = false
  router.push('/workbench/my-ai-actions')
}

/** P2 ④ 沙盘数据自清理：手动按钮，确认后删本人沙盘合成行 + bob 演示账号（保留证据与真实副作用） */
async function confirmCleanup() {
  try {
    await ElMessageBox.confirm(t('sandboxCleanupConfirm'), t('sandboxCleanup'), {
      type: 'warning',
      confirmButtonText: t('sandboxCleanup'),
      cancelButtonText: t('cancel'),
    })
  } catch {
    return // 取消
  }
  cleaning.value = true
  try {
    const r = await aiApi.trustSandboxCleanup()
    let msg = t('sandboxCleanupDone', { c: r.removedCustomers.length, b: r.removedBobUsers })
    if (r.skippedCustomers.length) {
      msg += ` ${t('sandboxCleanupSkipped', { n: r.skippedCustomers.length })}`
    }
    ElMessage.success(msg)
  } catch (err) {
    ElMessage.error(err instanceof Error && err.message ? err.message : t('loadFailed'))
  } finally {
    cleaning.value = false
  }
}

// P2 轻埋点：旅程完成（到达完成态）记一次（去重：同一次 run 完成态抖动兜底）
let lastJourneyCompleteAt = 0
watch(journeyDone, (done) => {
  if (!done || journeySteps.value.length === 0) return
  const now = Date.now()
  if (now - lastJourneyCompleteAt < 2000) return
  lastJourneyCompleteAt = now
  bumpJourneyCompleted()
  // P2 ③ 跨访客：上报服务器并乐观更新今日/累计
  void aiApi
    .trustSandboxJourneyComplete()
    .then(() => {
      serverStats.value.today++
      serverStats.value.total++
    })
    .catch(() => {})
})

// hero「开始 3 分钟体验」带 ?journey=1 落地 → 自动一键连跑
onMounted(() => {
  const q = route.query.journey
  if (q === '1' || q === 'true') void startJourney()
  aiApi
    .trustSandboxJourneyStats()
    .then((s) => {
      serverStats.value = { today: s.today, total: s.total }
    })
    .catch(() => {})
})

onUnmounted(clearJourneyTimers)
</script>

<style scoped>
.tsd-detail {
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  white-space: pre-line;
  word-break: break-all;
}
.ts-journey-step {
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 10px;
  background: var(--el-bg-color);
}
/* 小屏下弹窗不超出视口 */
.ts-result-dialog :deep(.el-dialog) {
  max-width: calc(100vw - 24px);
  border-radius: 12px;
}
</style>

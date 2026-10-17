<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navSecurityShowcase')" :subtitle="t('securityShowcaseSubtitle')" />

    <el-alert type="info" :closable="false" class="mb-4">
      {{ t('securityShowcaseIntro') }}
    </el-alert>

    <el-row :gutter="16">
      <el-col v-for="s in scenarios" :key="s.id" :xs="24" :sm="12" :lg="8">
        <el-card class="h-100 mb-4 scenario-card" shadow="hover">
          <template #header>
            <div class="d-flex align-center justify-space-between ga-2">
              <span class="text-h6">{{ t(`scenarioTitle.${s.id}`) }}</span>
              <el-tag :type="categoryTag(s.category)" size="small">{{ t(`scenarioCategory.${s.category}`) }}</el-tag>
            </div>
          </template>
          <p class="text-body-2 text-medium-emphasis mb-2">{{ t(`scenarioDesc.${s.id}`) }}</p>
          <div class="prompt-box mb-3">{{ t(`scenarioPrompt.${s.id}`) }}</div>
          <el-button type="primary" plain :loading="running === s.id" :disabled="!!running && running !== s.id" @click="run(s.id)">
            <AppIcon icon="mdi-play-circle-outline" class="mr-1" />{{ t('runDemo') }}
          </el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="result" class="mt-4 replay-card">
      <template #header>
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span class="text-h6">{{ t('demoResult') }} · {{ t(`scenarioTitle.${result.scenarioId}`) }}</span>
          <div class="d-flex align-center ga-2">
            <el-tag size="small" type="info">{{ t('replayLabel') }}</el-tag>
            <el-tag :type="outcomeTag(result.outcome)" effect="dark" size="large">
              {{ t(`outcome.${result.outcome}`) }}
            </el-tag>
          </div>
        </div>
      </template>

      <div class="replay-controls mb-4">
        <el-button size="small" class="replay-toggle" :disabled="revealed >= total" @click="togglePlay">
          {{ playing ? t('replayPause') : t('replayPlay') }}
        </el-button>
        <el-button size="small" class="replay-next" :disabled="revealed >= total" @click="nextStep">
          {{ t('replayNext') }}
        </el-button>
        <el-button size="small" class="replay-show-all" :disabled="revealed >= total" @click="showAll">
          {{ t('replayShowAll') }}
        </el-button>
        <el-button size="small" class="replay-restart" @click="restart">
          {{ t('replayRestart') }}
        </el-button>
        <span class="text-body-2 text-medium-emphasis replay-counter">{{ t('replayProgress', { done: revealed, total }) }}</span>
        <el-progress :percentage="progressPercent" :show-text="false" class="replay-progress" />
      </div>

      <el-timeline>
        <el-timeline-item
          v-for="(step, i) in visibleSteps"
          :key="i + '-' + step.key"
          :timestamp="t(`step.${step.step}`)"
          placement="top"
        >
          <div class="step-card">
            <div class="d-flex align-center flex-wrap ga-2 mb-1">
              <el-tag size="small" :type="stepTagType(step.step)">{{ t(`step.${step.step}`) }}</el-tag>
              <span class="text-body-2">{{ loc(`scStep.${step.key}`, step.params) }}</span>
            </div>
            <div v-if="step.verdict || step.basisKey || hasEvidence(step)" class="step-meta">
              <div v-if="step.verdict" class="meta-line">
                <span class="meta-label">{{ t('verdictLabel') }}</span>
                <el-tag size="small" :type="verdictTag(step.verdict)" effect="dark">{{ t(`verdict.${step.verdict}`) }}</el-tag>
              </div>
              <div v-if="step.basisKey" class="meta-line">
                <span class="meta-label">{{ t('basisLabel') }}</span>
                <span class="text-body-2">{{ loc(step.basisKey, step.basisParams) }}</span>
              </div>
              <div v-if="hasEvidence(step)" class="meta-line">
                <span class="meta-label">{{ t('evidenceLabel') }}</span>
                <code v-for="(value, key) in step.evidence" :key="key" class="evidence-chip">{{ key }}={{ value }}</code>
              </div>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>

      <el-alert v-if="revealed >= total" type="success" :closable="false" class="mt-2 safety-panel">
        <div class="safety-title">{{ t('whySafe') }}</div>
        <div class="text-body-2">{{ loc(result.invariantKey) }}</div>
        <div class="text-body-2 mt-1"><strong>{{ t('reason') }}:</strong> {{ loc(`scReason.${result.reasonKey}`, result.reasonParams) }}</div>
      </el-alert>
    </el-card>

    <el-empty v-else-if="loaded && !scenarios.length" :description="t('securityShowcaseEmpty')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { securityShowcaseApi } from '@/api/securityShowcase'
import type {
  ShowcaseCategory,
  ShowcaseOutcome,
  ShowcaseResult,
  ShowcaseScenario,
  ShowcaseStep,
  ShowcaseVerdict,
} from '@/types/securityShowcase'

/** 逐步揭示的节拍：够慢到看清每一步，又能在 60 秒内走完一个场景（4 步 ≈ 2.4 秒） */
const STEP_INTERVAL_MS = 800

const { t } = useI18n()
const scenarios = ref<ShowcaseScenario[]>([])
const running = ref('')
const result = ref<ShowcaseResult | null>(null)
const loaded = ref(false)

// ── 时间线重放状态 ────────────────────────────────────────────────────────────
const revealed = ref(0)
const playing = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const total = computed(() => result.value?.trace.length ?? 0)
const visibleSteps = computed<ShowcaseStep[]>(() =>
  result.value ? result.value.trace.slice(0, revealed.value) : [],
)
const progressPercent = computed(() => (total.value === 0 ? 0 : Math.round((revealed.value / total.value) * 100)))

function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

/** 自动播放：一次只揭示一步；到末尾自动停（不循环） */
function scheduleNext() {
  clearTimer()
  if (!playing.value || !result.value || revealed.value >= total.value) {
    playing.value = false
    return
  }
  timer = setTimeout(() => {
    revealed.value += 1
    if (revealed.value >= total.value) {
      playing.value = false
      timer = null
    } else {
      scheduleNext()
    }
  }, STEP_INTERVAL_MS)
}

function startReplay() {
  clearTimer()
  revealed.value = total.value > 0 ? 1 : 0
  playing.value = total.value > 1
  if (playing.value) scheduleNext()
}

function togglePlay() {
  if (revealed.value >= total.value) return
  playing.value = !playing.value
  if (playing.value) scheduleNext()
  else clearTimer()
}

function nextStep() {
  clearTimer()
  playing.value = false
  if (revealed.value < total.value) revealed.value += 1
}

function showAll() {
  clearTimer()
  playing.value = false
  revealed.value = total.value
}

function restart() {
  startReplay()
}

onBeforeUnmount(clearTimer)

// ── 展示映射（判定本身来自服务端；这里只把判定值翻成颜色） ─────────────────────
function categoryTag(c: ShowcaseCategory) {
  return ({ injection: 'danger', unauthorized: 'warning', risk: 'danger', confirmation: 'primary', hallucination: 'info', revoke: 'success' } as Record<ShowcaseCategory, string>)[c] ?? 'info'
}
function outcomeTag(o: ShowcaseOutcome) {
  return ({ refused: 'danger', denied: 'warning', blocked: 'danger', requiresConfirmation: 'primary', unresolved: 'warning', revoked: 'success' } as Record<ShowcaseOutcome, string>)[o] ?? 'info'
}
function stepTagType(step: string) {
  return ({ input: 'info', guard: 'warning', decision: 'primary', outcome: 'success' } as Record<string, string>)[step] ?? 'info'
}
function verdictTag(v: ShowcaseVerdict) {
  return ({ info: 'info', allow: 'success', deny: 'danger', require: 'warning', block: 'danger' } as Record<ShowcaseVerdict, string>)[v] ?? 'info'
}
function hasEvidence(step: ShowcaseStep) {
  return !!step.evidence && Object.keys(step.evidence).length > 0
}

/** i18n 插值：reason/trace 文案带可选动态参数（feature/risk level 等） */
function loc(key: string, params?: Record<string, string | number>) {
  return params ? t(key, params as unknown as Record<string, unknown>) : t(key)
}

async function run(id: string) {
  running.value = id
  clearTimer()
  playing.value = false
  revealed.value = 0
  result.value = null
  try {
    result.value = await securityShowcaseApi.run(id)
    startReplay()
  } catch (err) {
    // 运行失败（含防线漂移 fail-loud）：明确提示而非无反馈静默
    ElMessage.error(err instanceof Error && err.message ? err.message : t('loadFailed'))
  } finally {
    running.value = ''
  }
}

onMounted(async () => {
  try {
    scenarios.value = await securityShowcaseApi.scenarios()
    loaded.value = true
  } catch {
    // 加载失败不置 loaded=true，避免误显「暂无对抗场景」空态
    ElMessage.error(t('loadFailed'))
  }
})
</script>

<style scoped>
.prompt-box {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.scenario-card :deep(.el-card__header) {
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.replay-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.replay-progress {
  min-width: 120px;
  flex: 1;
}
.step-card {
  padding: 4px 0;
}
.step-meta {
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.meta-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.meta-label {
  min-width: 84px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.evidence-chip {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.safety-panel {
  margin-top: 8px;
}
.safety-title {
  font-weight: 600;
  margin-bottom: 4px;
}
</style>

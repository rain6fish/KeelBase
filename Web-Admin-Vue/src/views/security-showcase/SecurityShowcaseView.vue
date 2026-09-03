<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navSecurityShowcase')" :subtitle="t('securityShowcaseSubtitle')" />

    <el-alert type="info" :closable="false" class="mb-4">
      {{ t('securityShowcaseIntro') }}
    </el-alert>

    <el-row :gutter="16">
      <el-col v-for="s in scenarios" :key="s.id" :xs="24" :sm="12" :lg="6">
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

    <el-card v-if="result" class="mt-4">
      <template #header>
        <div class="d-flex align-center justify-space-between">
          <span class="text-h6">{{ t('demoResult') }} · {{ t(`scenarioTitle.${result.scenarioId}`) }}</span>
          <el-tag :type="outcomeTag(result.outcome)" effect="dark" size="large">
            {{ t(`outcome.${result.outcome}`) }}
          </el-tag>
        </div>
      </template>
      <p class="mb-4">
        <strong>{{ t('reason') }}:</strong> {{ loc(`scReason.${result.reasonKey}`, result.reasonParams) }}
      </p>
      <el-timeline>
        <el-timeline-item v-for="step in result.trace" :key="step.step + '-' + step.key" :timestamp="t(`step.${step.step}`)" placement="top">
          <div class="d-flex align-center ga-2">
            <el-tag size="small" :type="stepTagType(step.step)">{{ t(`step.${step.step}`) }}</el-tag>
            <span class="text-body-2">{{ loc(`scStep.${step.key}`, step.params) }}</span>
          </div>
        </el-timeline-item>
      </el-timeline>
    </el-card>

    <el-empty v-else-if="loaded && !scenarios.length" :description="t('securityShowcaseEmpty')" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { securityShowcaseApi } from '@/api/securityShowcase'
import type { ShowcaseCategory, ShowcaseOutcome, ShowcaseResult, ShowcaseScenario } from '@/types/securityShowcase'

const { t } = useI18n()
const scenarios = ref<ShowcaseScenario[]>([])
const running = ref('')
const result = ref<ShowcaseResult | null>(null)
const loaded = ref(false)

function categoryTag(c: ShowcaseCategory) {
  return ({ injection: 'danger', unauthorized: 'warning', risk: 'danger', confirmation: 'primary' } as Record<ShowcaseCategory, string>)[c] ?? 'info'
}
function outcomeTag(o: ShowcaseOutcome) {
  return ({ refused: 'danger', denied: 'warning', blocked: 'danger', requiresConfirmation: 'primary' } as Record<ShowcaseOutcome, string>)[o] ?? 'info'
}
function stepTagType(step: string) {
  return ({ input: 'info', guard: 'warning', decision: 'primary', outcome: 'success' } as Record<string, string>)[step] ?? 'info'
}

/** i18n 插值：reason/trace 文案带可选动态参数（feature/risk level 等） */
function loc(key: string, params?: Record<string, string | number>) {
  return params ? t(key, params as unknown as Record<string, unknown>) : t(key)
}

async function run(id: string) {
  running.value = id
  try {
    result.value = await securityShowcaseApi.run(id)
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
</style>

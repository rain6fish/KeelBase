<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('trustSandboxTitle')" :subtitle="t('trustSandboxSubtitle')" />

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
        <div v-if="result.resultType && result.resultId" class="mb-2">
          <el-button size="small" type="primary" text @click="openAction(result)">
            <AppIcon icon="mdi-creation-outline" class="mr-1" />{{ t('trustSandboxViewAction') }}
          </el-button>
        </div>
        <div v-if="result.conversationId" class="text-body-2 text-medium-emphasis">
          <AppIcon icon="mdi-robot-outline" class="mr-1" />{{ t('trustSandboxConvHint') }}
        </div>
      </template>
      <template #footer>
        <el-button type="primary" plain @click="dialogVisible = false">{{ t('trustSandboxDialogClose') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { aiApi, type TrustSandboxRunResult } from '@/api/ai'

const { t } = useI18n()
const router = useRouter()

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

function outcomeTag(o: TrustSandboxRunResult['outcome']) {
  return ({ passed: 'success', check: 'warning', guide: 'info', unknown: 'info' } as Record<string, string>)[o] ?? 'info'
}

function scenarioIcon(id: string) {
  return scenarios.find((s) => s.id === id)?.icon ?? 'mdi-bullseye'
}

async function run(id: string) {
  running.value = id
  try {
    result.value = await aiApi.trustSandboxRun(id)
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
/* 小屏下弹窗不超出视口 */
.ts-result-dialog :deep(.el-dialog) {
  max-width: calc(100vw - 24px);
  border-radius: 12px;
}
</style>

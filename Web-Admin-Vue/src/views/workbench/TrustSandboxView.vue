<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('trustSandboxTitle')" :subtitle="t('trustSandboxSubtitle')" />

    <el-alert type="info" :closable="false" class="mb-4">
      {{ t('trustSandboxIntro') }}
    </el-alert>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="16">
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
      </el-col>

      <!-- 右侧常驻结果面板：运行演示后结果显示在右侧（大屏 sticky；窄屏堆叠到下方） -->
      <el-col :xs="24" :lg="8">
        <div class="ts-result-sticky">
          <el-card v-if="result" shadow="never" class="ts-result-card mb-4">
            <template #header>
              <div class="d-flex align-center justify-space-between">
                <span class="text-h6">{{ t('trustSandboxResult') }} · {{ t(`tsScenario.${result.scenario}.title`) }}</span>
                <el-tag :type="outcomeTag(result.outcome)" effect="dark" size="large">
                  {{ t(`tsOutcome.${result.outcome}`) }}
                </el-tag>
              </div>
            </template>
            <p class="mb-2 detail-box">{{ result.detail || '—' }}</p>
            <div v-if="result.resultType && result.resultId" class="mb-2">
              <el-button size="small" type="primary" text @click="openAction(result)">
                <AppIcon icon="mdi-creation-outline" class="mr-1" />{{ t('trustSandboxViewAction') }}
              </el-button>
            </div>
            <div v-if="result.conversationId" class="text-body-2 text-medium-emphasis">
              <AppIcon icon="mdi-robot-outline" class="mr-1" />{{ t('trustSandboxConvHint') }}
            </div>
          </el-card>
          <el-card v-else shadow="never" class="ts-result-empty mb-4">
            <div class="d-flex align-center ga-2 text-medium-emphasis">
              <AppIcon icon="mdi-bullseye" size="20" color="var(--el-color-info)" />
              <span class="text-body-2">{{ t('trustSandboxResultHint') }}</span>
            </div>
          </el-card>
        </div>
      </el-col>
    </el-row>
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

function outcomeTag(o: TrustSandboxRunResult['outcome']) {
  return ({ passed: 'success', check: 'warning', guide: 'info', unknown: 'info' } as Record<string, string>)[o] ?? 'info'
}

async function run(id: string) {
  running.value = id
  try {
    result.value = await aiApi.trustSandboxRun(id)
  } catch (err) {
    ElMessage.error(err instanceof Error && err.message ? err.message : t('loadFailed'))
  } finally {
    running.value = ''
  }
}

function openAction(r: TrustSandboxRunResult) {
  router.push(`/workbench/action/${r.resultType}/${r.resultId}`)
}
</script>

<style scoped>
.detail-box {
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  white-space: pre-line;
  word-break: break-all;
}
/* 大屏右侧结果面板吸顶，避免结果在下方时需滚动查看 */
.ts-result-sticky {
  position: sticky;
  top: 88px;
}
.ts-result-empty {
  border: 1px dashed var(--el-border-color);
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
}
.ts-result-empty :deep(.el-card__body) {
  padding: 16px 18px;
}
</style>

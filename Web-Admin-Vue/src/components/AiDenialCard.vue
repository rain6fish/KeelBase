<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  Trust-grade refusal card: who refused, why, and how to make it pass.

  The server's refusal guidance (`explanation`) is rendered from `reasonKey` / `nextStepKey` through
  this console's i18n catalogue, so the card follows the language switcher without a round-trip. The
  server's already-localized `reason` / `nextStep` are only a fallback for a missing key.

  信任化拒绝卡：谁拒绝的、为什么、怎样才能通过。

  服务端的拒绝指引（`explanation`）经本控制台的 i18n 文案表按 `reasonKey` / `nextStepKey` 渲染，
  切换语言无需回服务端。服务端已本地化的 `reason` / `nextStep` 只在 key 缺失时兜底。
-->
<template>
  <div class="ai-denial-card pa-2 mt-1" :class="`denied-by-${explanation.deniedBy}`">
    <div class="d-flex align-center ga-1">
      <AppIcon icon="mdi-shield-alert-outline" color="var(--el-color-danger)" size="16" />
      <el-tag type="danger" size="small" effect="plain">{{ deniedByLabel }}</el-tag>
      <span v-if="toolEnd.name" class="text-caption font-weight-medium">{{ toolEnd.name }}</span>
    </div>
    <div class="text-caption mt-1 ai-denial-line">
      <span class="font-weight-medium">{{ t('errorReason') }}</span>{{ reasonText }}
    </div>
    <div class="text-caption mt-1 ai-denial-line">
      <span class="font-weight-medium">{{ t('errorNextStep') }}</span>{{ nextStepText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import type { AiDenialExplanation, AiToolEnd } from '@/utils/streamChat'

const props = defineProps<{ toolEnd: AiToolEnd }>()

const { t, te } = useI18n()

const explanation = computed<AiDenialExplanation>(() => props.toolEnd.explanation as AiDenialExplanation)

const deniedByLabel = computed(() => {
  const key = `aiDenyBy${explanation.value.deniedBy
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`
  return te(key) ? t(key) : explanation.value.deniedBy
})

const params = computed<Record<string, string | number>>(() => explanation.value.params ?? {})

const reasonText = computed(() => {
  const key = explanation.value.reasonKey
  return key && te(key) ? t(key, params.value) : explanation.value.reason
})

const nextStepText = computed(() => {
  const key = explanation.value.nextStepKey
  return key && te(key) ? t(key, params.value) : explanation.value.nextStep
})
</script>

<style scoped>
.ai-denial-card {
  border-left: 3px solid var(--el-color-danger);
  border-radius: 4px;
  background: var(--el-color-danger-light-9);
}
.ai-denial-line {
  white-space: pre-wrap;
}
</style>

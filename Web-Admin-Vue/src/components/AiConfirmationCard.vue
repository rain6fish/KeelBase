<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="ai-confirm-card pa-3" :class="{ 'border-left': true }">
    <!-- 标题：写操作需确认 + 工具名 -->
    <div class="d-flex align-center ga-2 mb-2">
      <AppIcon icon="mdi-shield-alert" color="var(--el-color-warning)" size="20" />
      <span class="text-body-2 font-weight-medium">{{ t('confirmTitle') }}</span>
      <el-tag v-if="riskLabel" size="small" :type="riskTagType" effect="light">{{ riskLabel }}</el-tag>
      <el-tag v-if="confirmation.mode === 'approval'" size="small" type="warning" effect="plain">{{ t('riskApproval') }}</el-tag>
    </div>

    <!-- KB-5 run 卡（mode==='run'）：整批动作列表 + runRisk 徽标，一次授权 / 整批跳过 -->
    <template v-if="isRun">
      <div class="d-flex align-center ga-2 mb-2">
        <el-tag size="small" type="warning" effect="light">{{ runRiskLabel }}</el-tag>
        <span class="text-body-2 text-medium-emphasis">{{ runCountLabel }}</span>
      </div>
      <div class="run-items mb-2">
        <div v-for="(item, i) in runItems" :key="i" class="d-flex align-center ga-2 run-item">
          <AppIcon icon="mdi-arrow-right-thin" size="16" />
          <span class="text-body-2 flex-grow-1">{{ item.summary || item.toolName }}</span>
          <el-tag v-if="item.riskLevel" size="small" effect="plain">{{ item.riskLevel }}</el-tag>
        </div>
      </div>
      <div class="text-caption text-medium-emphasis mb-2">{{ t('confirmNeedsConfirmation') }}</div>
      <div class="d-flex align-center justify-end mt-2 ga-2">
        <el-button size="small" @click="emit('rejected')">
          <template #icon><AppIcon icon="mdi-close" /></template>
          {{ t('confirmReject') }}
        </el-button>
        <el-button size="small" type="primary" @click="emit('approved', false)">
          <template #icon><AppIcon icon="mdi-check" /></template>
          {{ t('confirmApprove') }}
        </el-button>
      </div>
    </template>

    <!-- 单动作卡（R3 即时 / R4 已提交审批） -->
    <template v-else>
      <div class="text-body-2 mb-1">{{ confirmation.summary || confirmation.toolName }}</div>
      <div v-if="hasArgs" class="text-caption text-medium-emphasis mb-1" style="font-family: monospace; white-space: pre-wrap">{{ argsText }}</div>

      <!-- Why：为何需要确认（风险级人类语言） -->
      <div class="text-caption text-medium-emphasis mb-2">{{ t('confirmNeedsConfirmation') }}</div>

      <!-- 技术详情（授权检查清单，可展开） -->
      <div v-if="confirmation.authorization?.checks?.length">
        <el-button text size="small" class="pa-0 mb-1" @click="showDetail = !showDetail">
          {{ showDetail ? t('collapseTechDetail') : t('expandTechDetail') }}
          <AppIcon :icon="showDetail ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" />
        </el-button>
        <div v-if="showDetail" class="pa-2" style="background: var(--el-fill-color-light); border-radius: 4px">
          <div v-for="c in confirmation.authorization.checks" :key="c.name" class="d-flex align-center ga-1 text-body-2">
            <AppIcon :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'" :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'" size="16" />
            <span :class="c.ok ? '' : 'text-error'">{{ c.note || c.name }}</span>
          </div>
        </div>
      </div>

      <!-- 操作：信任勾选 + 批准/拒绝 -->
      <div class="d-flex align-center justify-space-between mt-2">
        <el-checkbox v-model="trustTool" size="small">{{ t('confirmTrustTool') }}</el-checkbox>
        <div class="d-flex ga-2">
          <el-button size="small" @click="emit('rejected')">
            <template #icon><AppIcon icon="mdi-close" /></template>
            {{ t('confirmReject') }}
          </el-button>
          <el-button size="small" type="primary" @click="emit('approved', trustTool)">
            <template #icon><AppIcon icon="mdi-check" /></template>
            {{ t('confirmApprove') }}
          </el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import type { AiConfirmation } from '@/utils/streamChat'

const props = defineProps<{ confirmation: AiConfirmation }>()
const emit = defineEmits<{
  approved: [trustTool: boolean]
  rejected: []
}>()

const { t, te } = useI18n()
const trustTool = ref(false)
const showDetail = ref(false)

// KB-5：run 卡分支（mode==='run' 整批授权；run 卡隐藏 HS-6 信任勾选——per-tool 信任语义不被批内模糊）
const isRun = computed(() => props.confirmation.mode === 'run' && !!props.confirmation.run)
const runItems = computed(() => props.confirmation.run?.items ?? [])
const runRiskLevel = computed(() => props.confirmation.run?.riskLevel || '')
const runRiskLabel = computed(() => {
  const lv = runRiskLevel.value
  if (lv === 'R5') return t('riskBlocked')
  if (lv === 'R4') return t('riskApproval')
  if (lv === 'R3') return t('riskConfirm')
  return lv ? t('riskAuto') : ''
})
const runCountLabel = computed(() => {
  const n = runItems.value.length
  // i18n key 随并发提交后提为正式 zh/en；此前用带 key 的 fallback（KB-5 实现避开被占用 i18n 文件）
  return te('confirmRunCount') ? t('confirmRunCount', { n }) : `本次将执行 ${n} 个操作`
})

const hasArgs = computed(() => {
  const a = props.confirmation.arguments
  return !!a && Object.keys(a).length > 0
})
const argsText = computed(() =>
  props.confirmation.arguments ? JSON.stringify(props.confirmation.arguments, null, 2) : '',
)

/** 风险级标签（R5 阻断/红，R4 人工审批/橙，R3 需确认/橙，R0-R2 自动/绿） */
const riskLevel = computed(() => props.confirmation.authorization?.riskLevel || '')
const riskLabel = computed(() => {
  const lv = riskLevel.value
  if (lv === 'R5') return t('riskBlocked')
  if (lv === 'R4') return t('riskApproval')
  if (lv === 'R3') return t('riskConfirm')
  return lv ? t('riskAuto') : ''
})
const riskTagType = computed<'danger' | 'warning' | 'success'>(() => {
  const lv = riskLevel.value
  if (lv === 'R5') return 'danger'
  if (lv === 'R4' || lv === 'R3') return 'warning'
  return 'success'
})
</script>

<style scoped>
.ai-confirm-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.border-left {
  border-left: 3px solid var(--el-color-warning);
}
.run-items {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 4px 8px;
  max-height: 220px;
  overflow-y: auto;
}
.run-item {
  padding: 4px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.run-item:last-child {
  border-bottom: none;
}
</style>

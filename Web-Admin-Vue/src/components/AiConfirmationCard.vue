<template>
  <div class="ai-confirm-card pa-3" :class="{ 'border-left': true }">
    <!-- 标题：写操作需确认 + 工具名 -->
    <div class="d-flex align-center ga-2 mb-2">
      <AppIcon icon="mdi-shield-alert" color="var(--el-color-warning)" size="20" />
      <span class="text-body-2 font-weight-medium">{{ t('confirmTitle') }}</span>
      <el-tag v-if="riskLabel" size="small" :type="riskTagType" effect="light">{{ riskLabel }}</el-tag>
      <el-tag v-if="confirmation.mode === 'approval'" size="small" type="warning" effect="plain">{{ t('riskApproval') }}</el-tag>
    </div>

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

const { t } = useI18n()
const trustTool = ref(false)
const showDetail = ref(false)

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
</style>

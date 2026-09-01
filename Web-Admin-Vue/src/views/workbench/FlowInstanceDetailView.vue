<template>
  <div>
    <PageHeader :title="inst?.definitionName ?? t('workbenchFlows')" :subtitle="inst ? t('flowStateLabel', { s: stateLabel(inst.state) }) : ''">
      <el-button v-if="inst" text size="small" @click="load">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <el-row v-if="inst" :gutter="16" class="mb-4">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>{{ t('flowInstanceInfo') }}</template>
          <div>
            <p><strong>{{ t('flowInitiator') }}:</strong> {{ inst.initiatorName ?? inst.initiatorId }}</p>
            <p><strong>{{ t('flowState') }}:</strong> {{ stateLabel(inst.state) }}</p>
            <p v-if="inst.definitionId"><strong>{{ t('flowDefinition') }}:</strong> <code>{{ inst.definitionId }}</code></p>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- A-7 审批链可视化：发起 → 每级 human_task（谁/何时/结果/意见） → 终态 -->
    <el-card v-if="inst" shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center ga-2">
          <AppIcon icon="mdi-lan" />
          <span>{{ t('flowChainTitle') }}</span>
        </div>
      </template>
      <el-timeline>
        <el-timeline-item
          v-for="(step, i) in approvalChain"
          :key="i"
          :type="step.type"
          :timestamp="step.time"
          :hollow="step.type === 'primary'"
        >
          <span class="text-body-2">{{ step.label }}</span>
          <div v-if="step.detail" class="text-caption text-medium-emphasis">{{ step.detail }}</div>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { formatTime } from '@/utils/format'
import { flowApi, type FlowInstance } from '@/api/flow'

const { t } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()
const id = Number(route.params.id)

const inst = ref<FlowInstance | null>(null)

/** A-7 审批链：发起 → 每级 human_task 审批（谁/何时/结果/意见） → 终态 */
const approvalChain = computed<Array<{ label: string; time: string; detail?: string; type: 'primary' | 'success' | 'danger' | 'warning' | 'info' }>>(() => {
  if (!inst.value) return []
  const i = inst.value
  const steps: Array<{ label: string; time: string; detail?: string; type: 'primary' | 'success' | 'danger' | 'warning' | 'info' }> = []
  // 1. 发起
  steps.push({
    type: 'primary',
    label: t('flowChainInitiated', { name: i.initiatorName ?? i.initiatorId ?? '—' }),
    time: i.createdAt ? formatTime(i.createdAt) : '',
  })
  // 2. 每级 human_task 审批
  for (const task of i.tasks ?? []) {
    const decided = task.status !== 'pending'
    steps.push({
      type: task.status === 'approved' ? 'success' : task.status === 'rejected' ? 'danger' : 'info',
      label: `${t('flowChainNode')}「${task.nodeName}」· ${t('flowChainDecide', {
        name: task.assigneeName ?? task.assigneeId ?? '—',
        d: task.status === 'approved' ? t('flowChainApproved') : task.status === 'rejected' ? t('flowChainRejected') : t('flowChainPending'),
      })}`,
      time: task.updatedAt ? formatTime(task.updatedAt) : '',
      detail: task.decisionNote ?? undefined,
    })
    if (!decided) break
  }
  // 3. 终态
  steps.push({ type: finalType(i.state), label: stateLabel(i.state), time: i.updatedAt ? formatTime(i.updatedAt) : '' })
  return steps
})

function finalType(state: string): 'primary' | 'success' | 'danger' | 'warning' | 'info' {
  return state === 'completed' ? 'success' : state === 'failed' || state === 'rolled_back' ? 'danger' : state === 'running' ? 'warning' : 'info'
}

function stateLabel(s: string) {
  return {
    pending: t('flowStatePending'),
    running: t('flowStateRunning'),
    completed: t('flowStateCompleted'),
    failed: t('flowStateFailed'),
    rolled_back: t('flowStateRolledBack'),
  }[s] ?? s
}

async function load() {
  try {
    inst.value = await flowApi.instance(id)
  } catch {
    snackbar.error(t('loadFailed'))
  }
}

onMounted(load)
</script>

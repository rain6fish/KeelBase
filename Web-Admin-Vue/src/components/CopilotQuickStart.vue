<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  Guided quick start for the Copilot panel.

  Non-technical users pick an action and an entity; they never type a tool name or its arguments.
  The parent owns the actual work: risk analysis calls the deterministic read endpoint, and task
  creation calls the same CRM endpoint the customer page uses — a direct REST write with its own
  review step. It does **not** go through the AI stream, so the AI confirmation card does not gate
  it (a reasoned trade-off: the demo provider does not carry tool_calls across turns, so an AI write
  here would land on the wrong customer).

  Copilot 面板的引导式快捷入口。

  非技术用户只选动作与对象，不需要输入工具名或参数。真正的动作由父组件执行：风险分析调用既有的
  确定性只读端点；建任务调用与客户详情页**同一个** CRM 端点 —— 一次**直接的 REST 写**，由本组件
  自己的复核步骤把关。它**不**经过 AI 流式链路，因此**不**由 AI 确认卡把关（这是一处有理由的取舍：
  演示 Provider 跨轮不保留 tool_calls，走 AI 写会落到错误的客户上）。
-->
<template>
  <div class="copilot-quick-start" data-testid="copilot-quick-start">
    <div class="text-subtitle-2 font-weight-medium">{{ t('quickStartTitle') }}</div>
    <div class="text-caption text-medium-emphasis mb-3">{{ t('quickStartHint') }}</div>

    <div class="d-flex flex-wrap ga-2 mb-3">
      <el-button
        data-testid="quick-action-risk"
        :type="mode === 'risk' ? 'primary' : 'default'"
        :disabled="disabled"
        @click="openRisk"
      >
        <template #icon><AppIcon icon="mdi-shield-search-outline" /></template>
        {{ t('quickActionRisk') }}
      </el-button>
      <el-button
        data-testid="quick-action-task"
        :type="mode === 'task' ? 'primary' : 'default'"
        :disabled="disabled"
        @click="openTask"
      >
        <template #icon><AppIcon icon="mdi-playlist-plus" /></template>
        {{ t('quickActionTask') }}
      </el-button>
    </div>

    <!-- Risk analysis: pick a customer or a project, then one click. -->
    <!-- 风险分析：选客户或项目，然后一键执行。 -->
    <el-card v-if="mode === 'risk'" shadow="never" class="quick-panel" data-testid="quick-risk-panel">
      <div class="text-body-2 mb-2">{{ t('quickRiskFormHint') }}</div>

      <el-radio-group v-model="entityKind" size="small" class="mb-2" :disabled="loading">
        <el-radio-button value="customer">{{ t('quickEntityCustomer') }}</el-radio-button>
        <el-radio-button value="project">{{ t('quickEntityProject') }}</el-radio-button>
      </el-radio-group>

      <el-select
        v-model="riskId"
        data-testid="quick-risk-select"
        class="quick-select"
        filterable
        clearable
        :loading="loading"
        :placeholder="t('quickPickEntity')"
        :disabled="disabled || loading"
      >
        <el-option v-for="e in riskOptions" :key="e.id" :label="e.name" :value="e.id" />
      </el-select>

      <div v-if="loading" class="text-caption text-medium-emphasis mt-2">{{ t('loading') }}</div>
      <div v-else-if="loadError" class="text-caption text-error mt-2">{{ t('quickLoadFailed') }}</div>
      <div v-else-if="!riskOptions.length" class="text-caption text-medium-emphasis mt-2" data-testid="quick-empty">
        {{ entityKind === 'customer' ? t('quickNoCustomers') : t('quickNoProjects') }}
      </div>

      <div class="text-caption text-medium-emphasis mt-2">{{ t('quickRiskReadOnly') }}</div>
      <el-button
        class="mt-2"
        type="primary"
        data-testid="quick-risk-run"
        :disabled="disabled || loading || riskId == null"
        @click="runRisk"
      >
        {{ t('quickRiskRun') }}
      </el-button>
    </el-card>

    <!-- Task creation: pick a customer, type a title; the AI asks for confirmation. -->
    <!-- 建任务：选客户、填标题；AI 会在写入前请你确认。 -->
    <el-card v-if="mode === 'task'" shadow="never" class="quick-panel" data-testid="quick-task-panel">
      <div class="text-body-2 mb-2">{{ t('quickTaskFormHint') }}</div>

      <el-select
        v-model="taskCustomerId"
        data-testid="quick-task-customer"
        class="quick-select"
        filterable
        clearable
        :loading="loading"
        :placeholder="t('quickPickCustomer')"
        :disabled="disabled || loading"
      >
        <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>

      <div v-if="loading" class="text-caption text-medium-emphasis mt-2">{{ t('loading') }}</div>
      <div v-else-if="loadError" class="text-caption text-error mt-2">{{ t('quickLoadFailed') }}</div>
      <div v-else-if="!customers.length" class="text-caption text-medium-emphasis mt-2" data-testid="quick-empty">
        {{ t('quickNoCustomers') }}
      </div>

      <el-input
        v-model="taskTitle"
        class="mt-2"
        data-testid="quick-task-title"
        maxlength="120"
        :placeholder="t('quickTaskTitlePlaceholder')"
        :disabled="disabled"
      />
      <el-date-picker
        v-model="taskDue"
        class="mt-2"
        type="date"
        value-format="YYYY-MM-DD"
        :placeholder="t('quickTaskDue')"
        :disabled="disabled"
      />

      <div class="text-caption text-medium-emphasis mt-2">{{ t('quickTaskConfirmHint') }}</div>

      <!-- Review step: the exact customer/title/due are shown before any write. -->
      <!-- 复核步骤：写入任何数据前先展示确切的客户、标题与截止日期。 -->
      <div v-if="taskReview" class="review-box mt-2" data-testid="quick-task-review">
        <div class="text-body-2 font-weight-medium">{{ t('quickTaskReviewTitle') }}</div>
        <div class="text-body-2 mt-1" data-testid="quick-task-review-line">
          {{ t('quickTaskReviewLine', { title: taskTitle.trim(), name: selectedTaskCustomer?.name ?? '' }) }}
        </div>
        <div v-if="taskDue" class="text-caption text-medium-emphasis mt-1">{{ t('quickTaskDueLine', { date: taskDue }) }}</div>
        <div class="text-caption text-medium-emphasis mt-1">{{ t('quickTaskReviewHint') }}</div>
        <div class="d-flex ga-2 mt-2">
          <el-button data-testid="quick-task-back" @click="taskReview = false">{{ t('quickTaskBack') }}</el-button>
          <el-button type="primary" data-testid="quick-task-confirm" @click="confirmTask">{{ t('quickTaskConfirm') }}</el-button>
        </div>
      </div>
      <el-button
        v-else
        class="mt-2"
        type="primary"
        data-testid="quick-task-create"
        :disabled="disabled || loading || taskCustomerId == null || !taskTitle.trim()"
        @click="taskReview = true"
      >
        {{ t('quickTaskCreate') }}
      </el-button>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { crmApi } from '@/api/crm'
import { pmApi } from '@/api/pm'

interface QuickEntity {
  id: number
  name: string
}

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{
  (e: 'analyze-risk', payload: { kind: 'customer' | 'project'; id: number; name: string }): void
  (e: 'create-task', payload: { customerId: number; customerName: string; title: string; dueDate?: string }): void
}>()

const { t } = useI18n()

const mode = ref<'idle' | 'risk' | 'task'>('idle')
const entityKind = ref<'customer' | 'project'>('customer')
const loading = ref(false)
const loadError = ref(false)
const customers = ref<QuickEntity[]>([])
const projects = ref<QuickEntity[]>([])
const customersLoaded = ref(false)
const projectsLoaded = ref(false)
const riskId = ref<number | null>(null)
const taskCustomerId = ref<number | null>(null)
const taskTitle = ref('')
const taskDue = ref('')
const taskReview = ref(false)

const riskOptions = computed(() => (entityKind.value === 'customer' ? customers.value : projects.value))
const selectedTaskCustomer = computed(() => customers.value.find((c) => c.id === taskCustomerId.value))

async function loadCustomers() {
  loading.value = true
  loadError.value = false
  try {
    const page = await crmApi.customers({ limit: 100 })
    customers.value = page.items.map((c) => ({ id: c.id, name: c.name }))
    customersLoaded.value = true
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function loadProjects() {
  loading.value = true
  loadError.value = false
  try {
    const page = await pmApi.projects({ limit: 100 })
    projects.value = page.items.map((p) => ({ id: p.id, name: p.name }))
    projectsLoaded.value = true
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function ensureKindLoaded() {
  if (entityKind.value === 'customer') {
    if (!customersLoaded.value) await loadCustomers()
  } else if (!projectsLoaded.value) {
    await loadProjects()
  }
}

async function openRisk() {
  mode.value = 'risk'
  riskId.value = null
  await ensureKindLoaded()
}

async function openTask() {
  mode.value = 'task'
  taskCustomerId.value = null
  taskTitle.value = ''
  taskDue.value = ''
  taskReview.value = false
  if (!customersLoaded.value) await loadCustomers()
}

watch(entityKind, () => {
  riskId.value = null
  void ensureKindLoaded()
})

function runRisk() {
  const found = riskOptions.value.find((e) => e.id === riskId.value)
  if (!found || props.disabled) return
  emit('analyze-risk', { kind: entityKind.value, id: found.id, name: found.name })
}

function confirmTask() {
  const customer = selectedTaskCustomer.value
  const title = taskTitle.value.trim()
  if (!customer || !title || props.disabled) return
  taskReview.value = false
  emit('create-task', {
    customerId: customer.id,
    customerName: customer.name,
    title,
    dueDate: taskDue.value || undefined,
  })
}
</script>

<style scoped>
.copilot-quick-start {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px;
  background: var(--el-fill-color-lighter);
}
.quick-panel {
  background: var(--el-bg-color);
}
.quick-select {
  width: 100%;
}
</style>

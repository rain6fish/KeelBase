<template>
  <div>
    <PageHeader :title="detail?.customer.name ?? t('crmTitle')" :subtitle="subtitle">
      <el-button type="primary" plain @click="showCopilot = true">
        <template #icon><AppIcon icon="mdi-robot-outline" /></template>
        {{ t('copilotTitle') }}
      </el-button>
    </PageHeader>

    <el-row v-if="detail" :gutter="16" class="mb-4">
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="h-100">
          <template #header>{{ t('crmCustomerInfo') }}</template>
          <div>
            <p v-if="detail.customer.company"><strong>{{ t('crmCustomerCompany') }}:</strong> {{ detail.customer.company }}</p>
            <p v-if="detail.customer.email"><strong>Email:</strong> {{ detail.customer.email }}</p>
            <p v-if="detail.customer.phone"><strong>{{ t('crmPhone') }}:</strong> {{ detail.customer.phone }}</p>
            <div class="d-flex ga-2 flex-wrap">
              <el-tag size="small" effect="light">{{ statusLabel(detail.customer.status) }}</el-tag>
              <el-tag size="small" :type="{ green: 'success', amber: 'warning', orange: 'warning', red: 'danger', grey: 'info' }[riskColor(detail.customer.riskLevel)] ?? 'info'" effect="light">{{ riskLabel(detail.customer.riskLevel) }}</el-tag>
            </div>
            <p v-if="detail.customer.notes" class="mt-3 text-body-2">{{ detail.customer.notes }}</p>
            <el-divider class="my-3" />
            <el-button type="primary" :loading="analyzing" @click="analyze">
              <template #icon><AppIcon icon="mdi-chart-line" /></template>
              {{ t('crmAnalyzeRisk') }}
            </el-button>
            <template v-if="analysis">
              <p class="mt-3 mb-0" :style="{ color: riskColor(analysis.level) }">
                <strong>{{ t('crmRiskLevel') }}: {{ riskLabel(analysis.level) }}</strong>
              </p>
              <p v-for="(r, i) in analysis.reasons" :key="i" class="mb-0 text-body-2">• {{ r }}</p>
            </template>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="16">
        <el-row :gutter="16">
          <el-col :span="24">
            <el-card shadow="never">
              <template #header>
                <div class="d-flex align-center justify-space-between">
                  <span>{{ t('crmOrders') }}</span>
                  <el-button size="small" plain @click="openAdd('order')">
                    <template #icon><AppIcon icon="mdi-plus" /></template>
                    {{ t('crmAddOrder') }}
                  </el-button>
                </div>
              </template>
              <div v-for="o in detail.orders" :key="o.id" class="py-1">
                <div class="text-body-2">{{ o.status }} · ¥{{ o.amount.toFixed(0) }}</div>
                <div class="text-caption text-medium-emphasis">{{ o.orderDate || o.dueDate || '-' }}</div>
              </div>
              <div v-if="!detail.orders.length" class="text-medium-emphasis">{{ t('crmNoOrders') }}</div>
            </el-card>
          </el-col>

          <el-col :span="24">
            <el-card shadow="never">
              <template #header>
                <div class="d-flex align-center justify-space-between">
                  <span>{{ t('crmActivities') }}</span>
                  <el-button size="small" plain @click="openAdd('activity')">
                    <template #icon><AppIcon icon="mdi-plus" /></template>
                    {{ t('crmAddActivity') }}
                  </el-button>
                </div>
              </template>
              <div v-for="a in detail.activities" :key="a.id" class="py-1">
                <div class="text-body-2">{{ a.summary }}</div>
                <div class="text-caption text-medium-emphasis">{{ a.type }}</div>
              </div>
              <div v-if="!detail.activities.length" class="text-medium-emphasis">{{ t('crmNoActivities') }}</div>
            </el-card>
          </el-col>

          <el-col :span="24">
            <el-card shadow="never">
              <template #header>
                <div class="d-flex align-center justify-space-between">
                  <span>{{ t('crmTasks') }}</span>
                  <el-button size="small" plain @click="openAdd('task')">
                    <template #icon><AppIcon icon="mdi-plus" /></template>
                    {{ t('crmAddTask') }}
                  </el-button>
                </div>
              </template>
              <div v-for="tk in detail.tasks" :key="tk.id" class="d-flex align-center justify-space-between py-1">
                <span :class="{ 'text-decoration-line-through text-medium-emphasis': tk.status === 'completed' }">{{ tk.title }}</span>
                <div class="d-flex align-center">
                  <!-- D1 治理钻取：业务动作（crm_task）→ 谁/何时/做了什么/为何允许/结果/影响/完整性 -->
                  <el-button
                    circle
                    text
                    size="small"
                    :title="t('governanceDetail')"
                    @click="openGovernance('crm_task', tk.id)"
                  >
                    <AppIcon icon="mdi-shield-search" />
                  </el-button>
                  <el-button
                    v-if="tk.status !== 'completed'"
                    circle
                    text
                    type="success"
                    size="small"
                    :title="t('crmTaskCompleted')"
                    @click="completeTask(tk.id)"
                  >
                    <AppIcon icon="mdi-check-circle" />
                  </el-button>
                </div>
              </div>
              <div v-if="!detail.tasks.length" class="text-medium-emphasis">{{ t('crmNoTasks') }}</div>
            </el-card>
          </el-col>

          <el-col :span="24">
            <el-card shadow="never">
              <template #header>{{ t('crmRisks') }}</template>
              <div v-for="r in detail.risks" :key="r.id" class="py-1 text-body-2">{{ riskLabel(r.level) }} · {{ r.reason }}</div>
              <div v-if="!detail.risks.length" class="text-medium-emphasis">{{ t('crmNoRisks') }}</div>
            </el-card>
          </el-col>
        </el-row>
      </el-col>
    </el-row>

    <!-- AI Copilot：当前客户上下文 AI 助手（P0） -->
    <CrmCopilotDrawer
      v-model="showCopilot"
      :customer-name="detail?.customer.name ?? ''"
      :customer-id="id"
    />

    <!-- D1 治理钻取：业务动作（crm_task）→ 谁/何时/做了什么/为何允许/结果/影响/完整性 -->
    <GovernanceActionDrawer
      v-model="governanceOpen"
      :result-type="governanceTarget?.resultType ?? ''"
      :result-id="governanceTarget?.resultId ?? 0"
    />

    <el-dialog v-model="showAdd" :width="420" :title="addTitle">
      <template v-if="addType === 'order'">
        <el-form-item :label="t('crmOrderAmountHint')">
          <el-input v-model="addValue" type="number" />
        </el-form-item>
      </template>
      <template v-else-if="addType === 'activity'">
        <el-form-item :label="t('crmActivitySummaryHint')">
          <el-input v-model="addValue" />
        </el-form-item>
      </template>
      <template v-else>
        <el-form-item :label="t('crmTaskTitleHint')">
          <el-input v-model="addValue" />
        </el-form-item>
      </template>
      <template #footer>
        <div class="d-flex justify-end ga-2">
          <el-button @click="showAdd = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="onAdd">{{ t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import CrmCopilotDrawer from '@/components/CrmCopilotDrawer.vue'
import GovernanceActionDrawer from '@/components/GovernanceActionDrawer.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { crmApi, type CrmCustomerDetail, type RiskAnalysis } from '@/api/crm'

const { t } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()
const id = Number(route.params.id)

const detail = ref<CrmCustomerDetail | null>(null)
const analysis = ref<RiskAnalysis | null>(null)
const analyzing = ref(false)
const showCopilot = ref(false)
const governanceOpen = ref(false)
const governanceTarget = ref<{ resultType: string; resultId: number } | null>(null)
const showAdd = ref(false)
const saving = ref(false)
const addType = ref('order')
const addValue = ref('')

const subtitle = computed(() => detail.value ? `${detail.value.orders.length} ${t('crmOrders')} · ${detail.value.activities.length} ${t('crmActivities')}` : '')
const addTitle = computed(() => ({ order: t('crmAddOrder'), activity: t('crmAddActivity'), task: t('crmAddTask') })[addType.value] ?? '')

function statusLabel(s: string) {
  return { lead: t('crmStatusLead'), active: t('crmStatusActive'), churn_risk: t('crmStatusChurnRisk'), inactive: t('crmStatusInactive') }[s] ?? s
}
function riskLabel(l: string) {
  return { low: t('crmRiskLow'), medium: t('crmRiskMedium'), high: t('crmRiskHigh'), critical: t('crmRiskCritical') }[l] ?? l
}
function riskColor(l: string) {
  return { low: 'green', medium: 'amber', high: 'orange', critical: 'red' }[l] ?? 'grey'
}

async function load() {
  try {
    detail.value = await crmApi.detail(id)
  } catch {
    snackbar.error(t('loadFailed'))
  }
}

async function analyze() {
  analyzing.value = true
  try {
    analysis.value = await crmApi.analyze(id)
    snackbar.success(t('crmAnalysisDone'))
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    analyzing.value = false
  }
}

function openAdd(type: string) {
  addType.value = type
  addValue.value = ''
  showAdd.value = true
}

/** D1 治理钻取：打开业务动作（resultType:resultId）的治理详情抽屉 */
function openGovernance(resultType: string, resultId: number) {
  governanceTarget.value = { resultType, resultId }
  governanceOpen.value = true
}

async function onAdd() {
  const value = addValue.value.trim()
  if (!value) return
  saving.value = true
  try {
    if (addType.value === 'order') {
      const amount = Number(value)
      if (Number.isNaN(amount)) {
        snackbar.error(t('crmOrderAmountHint'))
        return
      }
      await crmApi.createOrder(id, { amount })
    } else if (addType.value === 'activity') {
      await crmApi.createActivity(id, { summary: value })
    } else {
      await crmApi.createTask({ customerId: id, title: value })
    }
    showAdd.value = false
    snackbar.success(t('crmCreated'))
    load()
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    saving.value = false
  }
}

async function completeTask(taskId: number) {
  try {
    await crmApi.completeTask(taskId)
    snackbar.success(t('crmTaskCompleted'))
    load()
  } catch {
    snackbar.error(t('saveFailed'))
  }
}

onMounted(load)
</script>

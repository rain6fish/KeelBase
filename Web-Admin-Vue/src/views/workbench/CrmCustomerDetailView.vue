<template>
  <div>
    <PageHeader :title="detail?.customer.name ?? t('crmTitle')" :subtitle="subtitle" />

    <v-row v-if="detail" class="mb-4">
      <v-col cols="12" md="4">
        <v-card class="h-100">
          <v-card-title>{{ t('crmCustomerInfo') }}</v-card-title>
          <v-card-text>
            <p v-if="detail.customer.company"><strong>{{ t('crmCustomerCompany') }}:</strong> {{ detail.customer.company }}</p>
            <p v-if="detail.customer.email"><strong>Email:</strong> {{ detail.customer.email }}</p>
            <p v-if="detail.customer.phone"><strong>{{ t('crmPhone') }}:</strong> {{ detail.customer.phone }}</p>
            <v-chip size="small" class="mr-2" variant="tonal">{{ statusLabel(detail.customer.status) }}</v-chip>
            <v-chip size="small" :color="riskColor(detail.customer.riskLevel)" variant="tonal">{{ riskLabel(detail.customer.riskLevel) }}</v-chip>
            <p v-if="detail.customer.notes" class="mt-3 text-body-2">{{ detail.customer.notes }}</p>
            <v-divider class="my-3" />
            <v-btn color="primary" :loading="analyzing" prepend-icon="mdi-chart-line" @click="analyze">
              {{ t('crmAnalyzeRisk') }}
            </v-btn>
            <template v-if="analysis">
              <p class="mt-3 mb-0" :style="{ color: riskColor(analysis.level) }">
                <strong>{{ t('crmRiskLevel') }}: {{ riskLabel(analysis.level) }}</strong>
              </p>
              <p v-for="(r, i) in analysis.reasons" :key="i" class="mb-0 text-body-2">• {{ r }}</p>
            </template>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="8">
        <v-row>
          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                {{ t('crmOrders') }}
                <v-spacer />
                <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="openAdd('order')">{{ t('crmAddOrder') }}</v-btn>
              </v-card-title>
              <v-list dense>
                <v-list-item v-for="o in detail.orders" :key="o.id">
                  <template #title>
                    <span>{{ o.status }} · ¥{{ o.amount.toFixed(0) }}</span>
                  </template>
                  <template #subtitle>{{ o.orderDate || o.dueDate || '-' }}</template>
                </v-list-item>
                <v-list-item v-if="!detail.orders.length">{{ t('crmNoOrders') }}</v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                {{ t('crmActivities') }}
                <v-spacer />
                <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="openAdd('activity')">{{ t('crmAddActivity') }}</v-btn>
              </v-card-title>
              <v-list dense>
                <v-list-item v-for="a in detail.activities" :key="a.id">
                  <template #title>{{ a.summary }}</template>
                  <template #subtitle>{{ a.type }}</template>
                </v-list-item>
                <v-list-item v-if="!detail.activities.length">{{ t('crmNoActivities') }}</v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                {{ t('crmTasks') }}
                <v-spacer />
                <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="openAdd('task')">{{ t('crmAddTask') }}</v-btn>
              </v-card-title>
              <v-list dense>
                <v-list-item v-for="tk in detail.tasks" :key="tk.id">
                  <template #title>
                    <span :class="{ 'text-decoration-line-through': tk.status === 'completed', 'text-grey': tk.status === 'completed' }">{{ tk.title }}</span>
                  </template>
                  <template #append>
                    <v-btn v-if="tk.status !== 'completed'" icon="mdi-check-circle" size="small" variant="text" color="success" @click="completeTask(tk.id)" />
                  </template>
                </v-list-item>
                <v-list-item v-if="!detail.tasks.length">{{ t('crmNoTasks') }}</v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card>
              <v-card-title>{{ t('crmRisks') }}</v-card-title>
              <v-list dense>
                <v-list-item v-for="r in detail.risks" :key="r.id">
                  <template #title>{{ riskLabel(r.level) }} · {{ r.reason }}</template>
                </v-list-item>
                <v-list-item v-if="!detail.risks.length">{{ t('crmNoRisks') }}</v-list-item>
              </v-list>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>

    <v-dialog v-model="showAdd" max-width="420">
      <v-card>
        <v-card-title>{{ addTitle }}</v-card-title>
        <v-card-text>
          <template v-if="addType === 'order'">
            <v-text-field v-model="addValue" :label="t('crmOrderAmountHint')" type="number" />
          </template>
          <template v-else-if="addType === 'activity'">
            <v-text-field v-model="addValue" :label="t('crmActivitySummaryHint')" />
          </template>
          <template v-else>
            <v-text-field v-model="addValue" :label="t('crmTaskTitleHint')" />
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAdd = false">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="onAdd">{{ t('save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { crmApi, type CrmCustomerDetail, type RiskAnalysis } from '@/api/crm'

const { t } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()
const id = Number(route.params.id)

const detail = ref<CrmCustomerDetail | null>(null)
const analysis = ref<RiskAnalysis | null>(null)
const analyzing = ref(false)
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

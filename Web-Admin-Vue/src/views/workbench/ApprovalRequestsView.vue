<template>
  <div>
    <PageHeader :title="t('apTitle')" :subtitle="t('apTotal', { n: total })" />

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <v-select v-model="statusFilter" :items="statusOptions" item-title="label" item-value="value" :label="t('apStatus')" density="compact" style="max-width: 200px" hide-details />
        <v-btn color="primary" prepend-icon="mdi-magnify" @click="load(1)">{{ t('filter') }}</v-btn>
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">{{ t('apSubmitRequest') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="headers" :items="requests" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.title="{ item }">
        <v-btn variant="text" color="primary" class="pa-0" @click="goDetail(item.id)">{{ item.title }}</v-btn>
      </template>
      <template #item.amount="{ item }">¥{{ item.amount.toFixed(0) }}</template>
      <template #item.status="{ item }">
        <StatusChip :status="item.status" :label-map="statusLabelMap" />
      </template>
      <template #item.riskLevel="{ item }">
        <v-chip size="small" :color="riskColor(item.riskLevel)" variant="tonal">{{ riskLabel(item.riskLevel) }}</v-chip>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <v-dialog v-model="showCreate" max-width="480">
      <v-card>
        <v-card-title>{{ t('apSubmitRequest') }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.title" :label="t('apTitleHint')" required />
          <v-select v-model="form.type" :items="typeOptions" item-title="label" item-value="value" :label="t('apType')" density="compact" hide-details />
          <v-text-field v-model.number="form.amount" :label="t('apAmountHint')" type="number" class="mt-2" />
          <v-text-field v-model="form.reason" :label="t('apReasonHint')" required />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreate = false">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="onCreate">{{ t('save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { approvalApi, type ApprovalRequest } from '@/api/approval'

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const requests = ref<ApprovalRequest[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const statusFilter = ref('')
const showCreate = ref(false)
const saving = ref(false)
const form = ref({ title: '', type: 'reimbursement', amount: 0, reason: '' })

const statusOptions = [
  { label: t('apStatusPending'), value: 'pending' },
  { label: t('apStatusNeedsReview'), value: 'needs_review' },
  { label: t('apStatusApproved'), value: 'approved' },
  { label: t('apStatusRejected'), value: 'rejected' },
  { label: t('apStatusAutoApproved'), value: 'auto_approved' },
]
const typeOptions = [
  { label: t('apTypeReimbursement'), value: 'reimbursement' },
  { label: t('apTypePurchase'), value: 'purchase' },
  { label: t('apTypeLeave'), value: 'leave' },
]

const headers = computed(() => [
  { title: t('apTitle'), key: 'title' },
  { title: t('apType'), key: 'type' },
  { title: t('apAmount'), key: 'amount' },
  { title: t('apStatus'), key: 'status' },
  { title: t('crmRisk'), key: 'riskLevel' },
])
const statusLabelMap: Record<string, string> = {
  pending: 'apStatusPending',
  needs_review: 'apStatusNeedsReview',
  approved: 'apStatusApproved',
  rejected: 'apStatusRejected',
  auto_approved: 'apStatusAutoApproved',
}

function riskLabel(l: string) {
  return { low: t('crmRiskLow'), medium: t('crmRiskMedium'), high: t('crmRiskHigh'), critical: t('crmRiskCritical') }[l] ?? l
}
function riskColor(l: string) {
  return { low: 'green', medium: 'amber', high: 'orange', critical: 'red' }[l] ?? 'grey'
}

async function load(p = 1) {
  loading.value = true
  try {
    const res = await approvalApi.requests({ page: p, limit, status: statusFilter.value || undefined })
    requests.value = res.items
    total.value = res.total
    page.value = p
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function goDetail(id: number) {
  router.push(`/workbench/approval/${id}`)
}

function openCreate() {
  form.value = { title: '', type: 'reimbursement', amount: 0, reason: '' }
  showCreate.value = true
}

async function onCreate() {
  if (!form.value.title.trim() || !form.value.reason.trim() || form.value.amount <= 0) {
    snackbar.error(t('apRequired'))
    return
  }
  saving.value = true
  try {
    await approvalApi.createRequest({
      title: form.value.title.trim(),
      type: form.value.type,
      amount: form.value.amount,
      reason: form.value.reason.trim(),
    })
    showCreate.value = false
    snackbar.success(t('crmCreated'))
    load()
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    saving.value = false
  }
}

onMounted(() => load())
</script>

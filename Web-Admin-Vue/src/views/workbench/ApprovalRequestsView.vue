<template>
  <div>
    <PageHeader :title="t('apTitle')" :subtitle="t('apTotal', { n: total })" />

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <el-select v-model="statusFilter" :placeholder="t('apStatus')" style="max-width: 200px" clearable>
          <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-button type="primary" @click="load(1)">
          <template #icon><AppIcon icon="mdi-magnify" /></template>
          {{ t('filter') }}
        </el-button>
        <div class="flex-grow-1" />
        <el-button type="primary" @click="openCreate">
          <template #icon><AppIcon icon="mdi-plus" /></template>
          {{ t('apSubmitRequest') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="requests" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.title="{ item }">
        <el-button text type="primary" class="pa-0" @click="goDetail(item.id)">{{ item.title }}</el-button>
      </template>
      <template #item.amount="{ item }">¥{{ item.amount.toFixed(0) }}</template>
      <template #item.status="{ item }">
        <StatusChip :status="item.status" :label-map="statusLabelMap" />
      </template>
      <template #item.riskLevel="{ item }">
        <el-tag size="small" :type="{ green: 'success', amber: 'warning', orange: 'warning', red: 'danger', grey: 'info' }[riskColor(item.riskLevel)] ?? 'info'" effect="light">{{ riskLabel(item.riskLevel) }}</el-tag>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <el-dialog v-model="showCreate" :width="480" :title="t('apSubmitRequest')">
      <el-form @submit.prevent="onCreate">
        <el-form-item :label="t('apTitleHint')">
          <el-input v-model="form.title" required />
        </el-form-item>
        <el-form-item :label="t('apType')">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="o in typeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('apAmountHint')">
          <el-input v-model.number="form.amount" type="number" class="mt-2" />
        </el-form-item>
        <el-form-item :label="t('apReasonHint')">
          <el-input v-model="form.reason" required />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="d-flex justify-end ga-2">
          <el-button @click="showCreate = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="onCreate">{{ t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>
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

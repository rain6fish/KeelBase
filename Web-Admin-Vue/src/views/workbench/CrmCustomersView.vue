<template>
  <div>
    <PageHeader :title="t('crmTitle')" :subtitle="t('crmTotal', { n: total })" />

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <DebouncedSearch v-model="keyword" :placeholder="t('crmSearchPlaceholder')" style="max-width: 240px" @search="load(1)" />
        <v-select v-model="statusFilter" :items="statusOptions" item-title="label" item-value="value" :label="t('crmStatus')" density="compact" style="max-width: 160px" hide-details />
        <v-select v-model="riskFilter" :items="riskOptions" item-title="label" item-value="value" :label="t('crmRisk')" density="compact" style="max-width: 140px" hide-details />
        <v-btn color="primary" prepend-icon="mdi-magnify" @click="load(1)">{{ t('filter') }}</v-btn>
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">{{ t('crmAddCustomer') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="headers" :items="customers" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.name="{ item }">
        <v-btn variant="text" color="primary" class="pa-0" @click="goDetail(item.id)">{{ item.name }}</v-btn>
      </template>
      <template #item.company="{ item }">{{ item.company || '-' }}</template>
      <template #item.status="{ item }">
        <StatusChip :status="item.status" :label-map="statusLabelMap" />
      </template>
      <template #item.riskLevel="{ item }">
        <v-chip size="small" :color="riskColor(item.riskLevel)" variant="tonal">{{ riskLabel(item.riskLevel) }}</v-chip>
      </template>
      <template #item.actions="{ item }">
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="confirmDelete(item)" />
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <v-dialog v-model="showCreate" max-width="460">
      <v-card>
        <v-card-title>{{ t('crmAddCustomer') }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" :label="t('crmCustomerName')" required />
          <v-text-field v-model="form.company" :label="t('crmCustomerCompany')" />
          <v-text-field v-model="form.email" label="Email" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreate = false">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="onCreate">{{ t('save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog v-model="showDelete" :title="t('crmDeleteTitle')" :content="t('crmDeleteContent')" @confirm="onDelete" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import DebouncedSearch from '@/components/DebouncedSearch.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { crmApi, type CrmCustomer } from '@/api/crm'

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const customers = ref<CrmCustomer[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const keyword = ref('')
const statusFilter = ref('')
const riskFilter = ref('')
const showCreate = ref(false)
const showDelete = ref(false)
const saving = ref(false)
const pendingDelete = ref<CrmCustomer | null>(null)
const form = ref({ name: '', company: '', email: '' })

const statusOptions = [
  { label: t('crmStatusLead'), value: 'lead' },
  { label: t('crmStatusActive'), value: 'active' },
  { label: t('crmStatusChurnRisk'), value: 'churn_risk' },
  { label: t('crmStatusInactive'), value: 'inactive' },
]
const riskOptions = [
  { label: t('crmRiskLow'), value: 'low' },
  { label: t('crmRiskMedium'), value: 'medium' },
  { label: t('crmRiskHigh'), value: 'high' },
  { label: t('crmRiskCritical'), value: 'critical' },
]

const headers = computed(() => [
  { title: t('crmCustomerName'), key: 'name' },
  { title: t('crmCustomerCompany'), key: 'company' },
  { title: t('crmStatus'), key: 'status' },
  { title: t('crmRisk'), key: 'riskLevel' },
  { title: '', key: 'actions', sortable: false },
])
const statusLabelMap: Record<string, string> = {
  lead: 'crmStatusLead',
  active: 'crmStatusActive',
  churn_risk: 'crmStatusChurnRisk',
  inactive: 'crmStatusInactive',
}

function riskLabel(level: string): string {
  return { low: t('crmRiskLow'), medium: t('crmRiskMedium'), high: t('crmRiskHigh'), critical: t('crmRiskCritical') }[level] ?? level
}
function riskColor(level: string): string {
  return { low: 'green', medium: 'amber', high: 'orange', critical: 'red' }[level] ?? 'grey'
}

async function load(p = 1) {
  loading.value = true
  try {
    const res = await crmApi.customers({
      page: p,
      limit,
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined,
      riskLevel: riskFilter.value || undefined,
    })
    customers.value = res.items
    total.value = res.total
    page.value = p
  } catch (e) {
    snackbar.error(t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function goDetail(id: number) {
  router.push(`/workbench/crm/${id}`)
}

function openCreate() {
  form.value = { name: '', company: '', email: '' }
  showCreate.value = true
}

async function onCreate() {
  if (!form.value.name.trim()) {
    snackbar.error(t('crmNameRequired'))
    return
  }
  saving.value = true
  try {
    await crmApi.createCustomer({
      name: form.value.name.trim(),
      company: form.value.company.trim() || undefined,
      email: form.value.email.trim() || undefined,
    })
    showCreate.value = false
    snackbar.success(t('crmCreated'))
    load()
  } catch (e) {
    snackbar.error(t('saveFailed'))
  } finally {
    saving.value = false
  }
}

function confirmDelete(item: CrmCustomer) {
  pendingDelete.value = item
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await crmApi.deleteCustomer(pendingDelete.value.id)
    snackbar.success(t('crmDeleted'))
    load()
  } catch {
    snackbar.error(t('deleteFailed'))
  }
  showDelete.value = false
}

onMounted(() => load())
</script>

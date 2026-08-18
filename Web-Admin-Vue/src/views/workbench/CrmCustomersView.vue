<template>
  <div>
    <PageHeader :title="t('crmTitle')" :subtitle="t('crmTotal', { n: total })" />

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <DebouncedSearch v-model="keyword" :placeholder="t('crmSearchPlaceholder')" style="max-width: 240px" @search="load(1)" />
        <el-select v-model="statusFilter" :placeholder="t('crmStatus')" style="max-width: 160px" clearable>
          <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-select v-model="riskFilter" :placeholder="t('crmRisk')" style="max-width: 140px" clearable>
          <el-option v-for="o in riskOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-button type="primary" @click="load(1)">
          <template #icon><AppIcon icon="mdi-magnify" /></template>
          {{ t('filter') }}
        </el-button>
        <div class="flex-grow-1" />
        <el-button type="primary" @click="openCreate">
          <template #icon><AppIcon icon="mdi-plus" /></template>
          {{ t('crmAddCustomer') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="customers" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.name="{ item }">
        <el-button text type="primary" class="pa-0" @click="goDetail(item.id)">{{ item.name }}</el-button>
      </template>
      <template #item.company="{ item }">{{ item.company || '-' }}</template>
      <template #item.status="{ item }">
        <StatusChip :status="item.status" :label-map="statusLabelMap" />
      </template>
      <template #item.riskLevel="{ item }">
        <el-tag size="small" :type="{ green: 'success', amber: 'warning', orange: 'warning', red: 'danger', grey: 'info' }[riskColor(item.riskLevel)] ?? 'info'" effect="light">{{ riskLabel(item.riskLevel) }}</el-tag>
      </template>
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <el-dialog v-model="showCreate" :width="460" :title="t('crmAddCustomer')">
      <el-form @submit.prevent="onCreate">
        <el-form-item :label="t('crmCustomerName')">
          <el-input v-model="form.name" required />
        </el-form-item>
        <el-form-item :label="t('crmCustomerCompany')">
          <el-input v-model="form.company" />
        </el-form-item>
        <el-form-item label="Email">
          <el-input v-model="form.email" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="d-flex justify-end ga-2">
          <el-button @click="showCreate = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="onCreate">{{ t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>

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

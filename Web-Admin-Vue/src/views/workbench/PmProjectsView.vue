<template>
  <div>
    <PageHeader :title="t('pmTitle')" :subtitle="t('pmTotal', { n: total })" />

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <DebouncedSearch v-model="keyword" :placeholder="t('pmSearchPlaceholder')" style="max-width: 220px" @search="load(1)" />
        <v-select v-model="statusFilter" :items="statusOptions" item-title="label" item-value="value" :label="t('pmStatus')" density="compact" style="max-width: 160px" hide-details />
        <v-btn color="primary" prepend-icon="mdi-magnify" @click="load(1)">{{ t('filter') }}</v-btn>
        <v-spacer />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">{{ t('pmAddProject') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="headers" :items="projects" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.name="{ item }">
        <v-btn variant="text" color="primary" class="pa-0" @click="goDetail(item.id)">{{ item.name }}</v-btn>
      </template>
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
        <v-card-title>{{ t('pmAddProject') }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" :label="t('pmProjectName')" required />
          <v-text-field v-model="form.description" :label="t('pmProjectDesc')" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreate = false">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="onCreate">{{ t('save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog v-model="showDelete" :title="t('pmDeleteTitle')" :content="t('pmDeleteContent')" @confirm="onDelete" />
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
import { pmApi, type PmProject } from '@/api/pm'

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const projects = ref<PmProject[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const keyword = ref('')
const statusFilter = ref('')
const showCreate = ref(false)
const showDelete = ref(false)
const saving = ref(false)
const pendingDelete = ref<PmProject | null>(null)
const form = ref({ name: '', description: '' })

const statusOptions = [
  { label: t('pmStatusPlanned'), value: 'planned' },
  { label: t('pmStatusActive'), value: 'active' },
  { label: t('pmStatusOnHold'), value: 'on_hold' },
  { label: t('pmStatusCompleted'), value: 'completed' },
]

const headers = computed(() => [
  { title: t('pmProjectName'), key: 'name' },
  { title: t('pmStatus'), key: 'status' },
  { title: t('crmRisk'), key: 'riskLevel' },
  { title: '', key: 'actions', sortable: false },
])
const statusLabelMap: Record<string, string> = {
  planned: 'pmStatusPlanned',
  active: 'pmStatusActive',
  on_hold: 'pmStatusOnHold',
  completed: 'pmStatusCompleted',
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
    const res = await pmApi.projects({ page: p, limit, keyword: keyword.value || undefined, status: statusFilter.value || undefined })
    projects.value = res.items
    total.value = res.total
    page.value = p
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function goDetail(id: number) {
  router.push(`/workbench/pm/${id}`)
}

function openCreate() {
  form.value = { name: '', description: '' }
  showCreate.value = true
}

async function onCreate() {
  if (!form.value.name.trim()) {
    snackbar.error(t('pmNameRequired'))
    return
  }
  saving.value = true
  try {
    await pmApi.createProject({ name: form.value.name.trim(), description: form.value.description.trim() || undefined })
    showCreate.value = false
    snackbar.success(t('crmCreated'))
    load()
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    saving.value = false
  }
}

function confirmDelete(item: PmProject) {
  pendingDelete.value = item
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await pmApi.deleteProject(pendingDelete.value.id)
    snackbar.success(t('crmDeleted'))
    load()
  } catch {
    snackbar.error(t('deleteFailed'))
  }
  showDelete.value = false
}

onMounted(() => load())
</script>

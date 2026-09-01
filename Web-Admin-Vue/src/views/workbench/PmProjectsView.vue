<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('pmTitle')" :subtitle="t('pmTotal', { n: total })" />

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <DebouncedSearch v-model="keyword" :placeholder="t('pmSearchPlaceholder')" style="max-width: 220px" @search="load(1)" />
        <el-select v-model="statusFilter" :placeholder="t('pmStatus')" style="max-width: 160px" clearable>
          <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-button type="primary" @click="load(1)">
          <template #icon><AppIcon icon="mdi-magnify" /></template>
          {{ t('filter') }}
        </el-button>
        <div class="flex-grow-1" />
        <el-button type="primary" @click="openCreate">
          <template #icon><AppIcon icon="mdi-plus" /></template>
          {{ t('pmAddProject') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="projects" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.name="{ item }">
        <el-button text type="primary" class="pa-0" @click="goDetail(item.id)">{{ item.name }}</el-button>
      </template>
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

    <el-dialog v-model="showCreate" :width="460" :title="t('pmAddProject')">
      <el-form @submit.prevent="onCreate">
        <el-form-item :label="t('pmProjectName')">
          <el-input v-model="form.name" required />
        </el-form-item>
        <el-form-item :label="t('pmProjectDesc')">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="d-flex justify-end ga-2">
          <el-button @click="showCreate = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="onCreate">{{ t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>

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

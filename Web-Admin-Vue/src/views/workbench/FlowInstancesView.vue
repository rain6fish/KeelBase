<template>
  <div>
    <PageHeader :title="t('workbenchFlows')">
      <el-button @click="load">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <AppTable :headers="headers" :items="items" :loading="loading" :total="items.length" :items-per-page="50" :hide-footer="true">
      <template #item.definitionName="{ item }">{{ item.definitionName ?? item.definitionId }}</template>
      <template #item.state="{ item }">
        <StatusChip :status="stateStatus(item.state)" :label-map="stateLabelMap" />
      </template>
      <template #item.pendingTasks="{ item }">
        <el-tag v-if="item.pendingTasks > 0" type="warning" size="small">{{ t('flowPendingTasks', { n: item.pendingTasks }) }}</el-tag>
        <span v-else class="text-medium-emphasis">—</span>
      </template>
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.actions="{ item }">
        <el-button text size="small" type="primary" @click="open(item.id)">
          {{ t('flowOpenChain') }}
        </el-button>
      </template>
    </AppTable>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTable from '@/components/AppTable.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { formatTime } from '@/utils/format'
import { flowApi, type MyFlowInstance } from '@/api/flow'

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const items = ref<MyFlowInstance[]>([])
const loading = ref(false)

const headers = [
  { key: 'definitionName', title: t('flowDefinition') },
  { key: 'state', title: t('flowState') },
  { key: 'pendingTasks', title: t('flowPending') },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: '' },
]

const stateLabelMap = {
  running: t('flowStateRunning'),
  completed: t('flowStateCompleted'),
  failed: t('flowStateFailed'),
  rolled_back: t('flowStateRolledBack'),
  pending: t('flowStatePending'),
}

function stateStatus(s: string): 'running' | 'completed' | 'failed' | 'info' {
  return s === 'completed' ? 'completed' : s === 'failed' || s === 'rolled_back' ? 'failed' : s === 'running' ? 'running' : 'info'
}

function open(id: number) {
  router.push(`/workbench/flows/${id}`)
}

async function load() {
  loading.value = true
  try {
    items.value = await flowApi.myInstances()
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

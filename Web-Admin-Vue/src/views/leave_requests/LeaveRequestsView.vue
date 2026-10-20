<!-- SPDX-License-Identifier: Apache-2.0 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { leave_requestsApi, type AdminLeaveRequest } from '@/api/leave_requests'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const items = ref<AdminLeaveRequest[]>([])
const loading = ref(false)
const showDelete = ref(false)
const pendingDelete = ref<AdminLeaveRequest | null>(null)

const headers = computed(() => [
  { key: 'id', title: 'ID' },
  { key: 'requestNo', title: 'requestNo' },
  { key: 'leaveType', title: 'leaveType' },
  { key: 'startDate', title: 'startDate' },
  { key: 'endDate', title: 'endDate' },
  { key: 'days', title: 'days' },
  { key: 'reason', title: 'reason' },
  { key: 'status', title: 'status' },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

async function load() {
  loading.value = true
  try {
    items.value = await leave_requestsApi.list()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function confirmDelete(item: AdminLeaveRequest) {
  pendingDelete.value = item
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await leave_requestsApi.remove(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    await load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader :title="t('navLeaveRequests')" :subtitle="t('leave_requestsViewSubtitle')" />
    <AppTable :headers="headers" :items="items" :loading="loading">
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>
    <ConfirmDialog
      v-model="showDelete"
      :title="t('leave_requestsDeleteTitle')"
      :content="t('leave_requestsDeleteContent')"
      @confirm="onDelete"
    />
  </div>
</template>

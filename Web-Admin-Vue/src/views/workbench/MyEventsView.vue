<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('workbenchMyEvents')" :subtitle="t('eventTotal', { n: total })" />

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center">
        <DebouncedSearch v-model="keyword" :placeholder="t('searchTitle')" style="max-width: 220px" @search="load(1)" />
        <RangeFilter v-model="range" @update:model-value="onRange" />
        <el-button type="primary" @click="load(1)">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
        <el-button plain @click="reset">
          <template #icon><AppIcon icon="mdi-refresh" /></template>
          {{ t('reset') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="events" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.startTime="{ item }">{{ formatTime(item.startTime) }}</template>
      <template #item.endTime="{ item }">{{ formatTime(item.endTime) }}</template>
      <template #item.location="{ item }">{{ item.location || '-' }}</template>
      <template #item.isCancelled="{ item }">
        <StatusChip :status="item.isCancelled ? 'cancelled' : 'active'" :label-map="statusLabelMap" />
      </template>
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <ConfirmDialog
      v-model="showDelete"
      :title="t('deleteEventTitle')"
      :content="t('deleteEventContent', { title: pendingDelete?.title || '' })"
      @confirm="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import DebouncedSearch from '@/components/DebouncedSearch.vue'
import RangeFilter from '@/components/RangeFilter.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { workbenchApi } from '@/api/workbench'
import { isEmailNotVerified } from '@/api/client'
import { formatTime } from '@/utils/format'
import type { MyEvent } from '@/types/workbench'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const events = ref<MyEvent[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)

const keyword = ref('')
const range = ref('all')
const since = ref<string | undefined>(undefined)

const statusLabelMap = computed(() => ({ active: t('active'), cancelled: t('cancelled') }))

const headers = computed(() => [
  { key: 'title', title: t('eventTitle') },
  { key: 'startTime', title: t('eventStart') },
  { key: 'endTime', title: t('eventEnd') },
  { key: 'location', title: t('locationCol') },
  { key: 'isCancelled', title: t('eventStatus') },
  { key: 'actions', title: t('actionCol') },
])

async function load(p = 1) {
  loading.value = true
  try {
    const res = await workbenchApi.events({ keyword: keyword.value || undefined, start: since.value, page: p, limit })
    events.value = res.items
    total.value = res.total
    page.value = p
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function onRange(key: string, s?: string) {
  range.value = key
  since.value = s
}
function reset() {
  keyword.value = ''
  range.value = 'all'
  since.value = undefined
  load(1)
}

// 删除
const showDelete = ref(false)
const pendingDelete = ref<MyEvent | null>(null)
function confirmDelete(e: MyEvent) {
  pendingDelete.value = e
  showDelete.value = true
}
async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await workbenchApi.removeEvent(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    load(page.value)
  } catch (err) {
    if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
    else snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

onMounted(() => load(1))
</script>

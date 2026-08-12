<template>
  <div>
    <PageHeader :title="t('navEvents')" :subtitle="t('eventTotal', { n: total })">
      <v-btn variant="tonal" prepend-icon="mdi-download" @click="onExport">{{ t('export') }}</v-btn>
    </PageHeader>

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <DebouncedSearch v-model="keyword" :placeholder="t('searchTitle')" style="max-width: 220px" @search="load(1)" />
        <v-text-field
          v-model.number="userId"
          :label="t('filterByUserId')"
          type="number"
          density="comfortable"
          variant="outlined"
          hide-details
          style="max-width: 160px"
        />
        <v-select
          v-model="status"
          :items="statusOptions"
          item-title="label"
          item-value="value"
          :label="t('eventStatus')"
          density="comfortable"
          variant="outlined"
          hide-details
          style="max-width: 150px"
        />
        <RangeFilter v-model="range" @update:model-value="onRange" />
        <v-btn color="primary" prepend-icon="mdi-filter-variant" @click="load(1)">{{ t('filter') }}</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="reset">{{ t('reset') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="headers" :items="events" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.startTime="{ item }">{{ formatTime(item.startTime) }}</template>
      <template #item.endTime="{ item }">{{ formatTime(item.endTime) }}</template>
      <template #item.user="{ item }">{{ item.user?.username || item.userId || '-' }}</template>
      <template #item.isCancelled="{ item }">
        <StatusChip :status="item.isCancelled ? 'cancelled' : 'active'" :label-map="statusLabelMap" />
      </template>
      <template #item.actions="{ item }">
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="confirmDelete(item)" />
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
import { eventsApi, type EventFilter } from '@/api/events'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import type { AdminEvent } from '@/types/event'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const events = ref<AdminEvent[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)

const keyword = ref('')
const userId = ref<number | undefined>(undefined)
const status = ref<string>('all')
const range = ref('all')
const since = ref<string | undefined>(undefined)

const statusOptions = [
  { label: t('allStatus'), value: 'all' },
  { label: t('active'), value: 'active' },
  { label: t('cancelled'), value: 'cancelled' },
]
const statusLabelMap = computed(() => ({ active: t('active'), cancelled: t('cancelled') }))

const headers = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'title', title: t('eventTitle') },
  { key: 'startTime', title: t('eventStart') },
  { key: 'endTime', title: t('eventEnd') },
  { key: 'user', title: t('eventUser') },
  { key: 'isCancelled', title: t('eventStatus') },
  { key: 'actions', title: t('actionCol') },
])

function currentFilter(): EventFilter {
  return {
    keyword: keyword.value || undefined,
    userId: userId.value,
    isCancelled: status.value === 'all' ? undefined : status.value === 'cancelled',
    start: since.value,
  }
}

async function load(p = 1) {
  loading.value = true
  try {
    const res = await eventsApi.adminAll(p, limit, currentFilter())
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
  userId.value = undefined
  status.value = 'all'
  range.value = 'all'
  since.value = undefined
  load(1)
}

function onExport() {
  downloadCsv(
    'events',
    [t('idCol'), t('eventTitle'), t('eventStart'), t('eventEnd'), t('eventUser'), t('eventStatus')],
    events.value.map((e) => [
      e.id,
      e.title,
      formatTime(e.startTime),
      formatTime(e.endTime),
      e.user?.username || e.userId || '',
      e.isCancelled ? t('cancelled') : t('active'),
    ]),
  )
  snackbar.success(t('exportDone'))
}

// 删除
const showDelete = ref(false)
const pendingDelete = ref<AdminEvent | null>(null)
function confirmDelete(e: AdminEvent) {
  pendingDelete.value = e
  showDelete.value = true
}
async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await eventsApi.adminRemove(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    load(page.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

onMounted(() => load(1))
</script>

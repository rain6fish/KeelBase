<template>
  <div>
    <PageHeader :title="t('opAuditTitle')" :subtitle="t('total', { n: total })">
      <v-btn variant="tonal" prepend-icon="mdi-download" @click="onExport">{{ t('export') }}</v-btn>
    </PageHeader>

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <v-text-field v-model="userId" :label="t('filterByUserId')" type="number" density="comfortable" variant="outlined" hide-details style="max-width: 180px" />
        <RangeFilter v-model="range" @update:model-value="onRange" />
        <v-btn color="primary" prepend-icon="mdi-filter-variant" @click="load(1)">{{ t('filter') }}</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="reset">{{ t('reset') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="headers" :items="logs" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.feature="{ item }">{{ tFeature(item.featureKey, item.featureFallback) }}</template>
      <template #item.statusCode="{ item }">
        <span :class="(item.statusCode ?? 200) >= 400 ? 'text-error' : ''">{{ item.statusCode ?? '-' }}</span>
      </template>
      <template #item.actions="{ item }">
        <v-btn icon="mdi-chevron-down" variant="text" size="small" @click="toggleExpand(item.id)" />
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <!-- 展开详情 -->
    <v-card v-if="expanded" class="mt-2">
      <v-card-title>{{ t('statistics') }}</v-card-title>
      <v-card-text>
        <v-list density="compact">
          <template v-if="expanded.ip">
            <v-list-item><v-list-item-title>IP</v-list-item-title>{{ expanded.ip }}</v-list-item>
          </template>
          <template v-if="expanded.userAgent">
            <v-list-item><v-list-item-title>User-Agent</v-list-item-title>{{ expanded.userAgent }}</v-list-item>
          </template>
          <template v-if="expanded.requestBody">
            <v-list-item><v-list-item-title>requestBody</v-list-item-title><pre class="text-body-2">{{ prettyJson(expanded.requestBody) }}</pre></v-list-item>
          </template>
        </v-list>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import RangeFilter from '@/components/RangeFilter.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { tFeature } from '@/i18n'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import type { OperationAuditLog } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const logs = ref<OperationAuditLog[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const userId = ref('')
const range = ref('all')
const since = ref<string | undefined>(undefined)
const expanded = ref<OperationAuditLog | null>(null)

const headers = computed(() => [
  { key: 'createdAt', title: t('timeCol') },
  { key: 'username', title: t('userCol') },
  { key: 'method', title: t('methodCol') },
  { key: 'feature', title: t('featureCol') },
  { key: 'path', title: t('pathCol') },
  { key: 'statusCode', title: t('statusCol') },
  { key: 'actions', title: '' },
])

async function load(p = 1) {
  loading.value = true
  try {
    const res = await auditApi.opLogs(p, limit, userId.value || undefined, since.value)
    logs.value = res.items
    total.value = res.total
    page.value = p
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadOpAuditFailed'))
  } finally {
    loading.value = false
  }
}

function onRange(key: string, s?: string) {
  range.value = key
  since.value = s
}
function reset() {
  userId.value = ''
  range.value = 'all'
  since.value = undefined
  load(1)
}
function toggleExpand(id: number) {
  const log = logs.value.find((l) => l.id === id)
  expanded.value = expanded.value?.id === id ? null : (log ?? null)
}
function prettyJson(s?: string | null): string {
  if (!s) return '-'
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

function onExport() {
  downloadCsv(
    'op-audit',
    [t('timeCol'), t('userCol'), t('methodCol'), t('featureCol'), t('pathCol'), t('statusCol')],
    logs.value.map((l) => [
      formatTime(l.createdAt),
      l.username || l.userId || '',
      l.method,
      tFeature(l.featureKey, l.featureFallback),
      l.path,
      l.statusCode ?? '',
    ]),
  )
  snackbar.success(t('exportDone'))
}

onMounted(() => load(1))
</script>

<template>
  <div>
    <PageHeader :title="t('aiAuditTitle')">
      <v-btn variant="tonal" prepend-icon="mdi-download" @click="onExport">{{ t('export') }}</v-btn>
    </PageHeader>

    <v-row class="mb-2">
      <v-col v-for="s in statCards" :key="s.label" cols="6" md="3">
        <StatCard v-bind="s" />
      </v-col>
    </v-row>

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <v-text-field v-model="userId" :label="t('filterByUser')" density="comfortable" variant="outlined" hide-details style="max-width: 200px" />
        <RangeFilter v-model="range" @update:model-value="onRange" />
        <v-btn color="primary" prepend-icon="mdi-filter-variant" @click="load">{{ t('filter') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="headers" :items="logs" :loading="loading" :total="logs.length" :items-per-page="limit" :hide-footer="true">
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.model="{ item }">{{ item.provider ? t('providerModel', { provider: item.provider, model: item.model || '-' }) : (item.model || '-') }}</template>
      <template #item.tokens="{ item }">{{ ((item.promptTokens ?? 0) + (item.completionTokens ?? 0)) || '-' }}</template>
      <template #item.isError="{ item }">
        <StatusChip :status="item.isError ? 'error' : 'ok'" :label-map="errorLabelMap" />
      </template>
      <template #item.expand="{ item }">
        <v-btn icon="mdi-chevron-down" variant="text" size="small" @click="toggleExpand(item.id)" />
      </template>
    </AppTable>

    <!-- 展开详情 -->
    <v-card v-if="expanded" class="mt-2">
      <v-card-title>{{ t('statistics') }}</v-card-title>
      <v-card-text>
        <v-list density="compact">
          <template v-if="expanded.detail">
            <v-list-item><v-list-item-title>detail</v-list-item-title>{{ expanded.detail }}</v-list-item>
          </template>
          <template v-if="expanded.errorMessage">
            <v-list-item><v-list-item-title>errorMessage</v-list-item-title>{{ expanded.errorMessage }}</v-list-item>
          </template>
          <template v-if="expanded.durationMs != null">
            <v-list-item><v-list-item-title>durationMs</v-list-item-title>{{ expanded.durationMs }} ms</v-list-item>
          </template>
          <template v-if="expanded.conversationId">
            <v-list-item><v-list-item-title>conversationId</v-list-item-title>{{ expanded.conversationId }}</v-list-item>
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
import StatCard from '@/components/StatCard.vue'
import RangeFilter from '@/components/RangeFilter.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import type { AuditLog, UsageStats } from '@/types/audit'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const logs = ref<AuditLog[]>([])
const stats = ref<UsageStats | null>(null)
const loading = ref(false)
const userId = ref('')
const range = ref('all')
const since = ref<string | undefined>(undefined)
const expanded = ref<AuditLog | null>(null)
const limit = 50

const headers = computed(() => [
  { key: 'createdAt', title: t('timeCol') },
  { key: 'username', title: t('userCol') },
  { key: 'action', title: t('featureCol') },
  { key: 'model', title: t('modelCol') },
  { key: 'tokens', title: t('tokenCol') },
  { key: 'isError', title: t('statusCol') },
  { key: 'expand', title: '' },
])

const errorLabelMap = computed(() => ({ ok: t('ok'), error: t('error') }))

const statCards = computed(() => [
  { label: t('conversations'), value: stats.value?.totalConversations ?? '-', icon: 'mdi-forum-outline', color: 'primary' },
  { label: t('messages'), value: stats.value?.totalMessages ?? '-', icon: 'mdi-message-outline', color: 'success' },
  { label: t('totalTokens'), value: stats.value?.totalTokens ?? '-', icon: 'mdi-database-outline', color: 'warning' },
  { label: t('errors'), value: stats.value?.totalErrors ?? '-', icon: 'mdi-alert-circle-outline', color: 'error' },
])

async function load() {
  loading.value = true
  try {
    const [logsRes, statsRes] = await Promise.all([
      auditApi.logs({ userId: userId.value || undefined, limit, since: since.value }),
      auditApi.stats(since.value),
    ])
    logs.value = logsRes
    stats.value = statsRes
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
function toggleExpand(id: number) {
  const log = logs.value.find((l) => l.id === id)
  expanded.value = expanded.value?.id === id ? null : (log ?? null)
}

function onExport() {
  downloadCsv(
    'ai-audit',
    [t('timeCol'), t('userCol'), t('featureCol'), t('modelCol'), t('tokenCol'), t('statusCol')],
    logs.value.map((l) => [
      formatTime(l.createdAt),
      l.username || l.userId || '',
      l.action,
      l.provider ? `${l.provider}/${l.model}` : (l.model || ''),
      (l.promptTokens ?? 0) + (l.completionTokens ?? 0),
      l.isError ? t('error') : t('ok'),
    ]),
  )
  snackbar.success(t('exportDone'))
}

onMounted(load)
</script>

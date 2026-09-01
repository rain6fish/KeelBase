<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('opAuditTitle')" :subtitle="t('total', { n: total })">
      <el-button @click="onExport">
        <template #icon><AppIcon icon="mdi-download" /></template>
        {{ t('export') }}
      </el-button>
    </PageHeader>

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap align-center pa-4">
        <el-input
          v-model="userId"
          :placeholder="t('filterByUserId')"
          type="number"
          clearable
          style="max-width: 180px"
        />
        <RangeFilter v-model="range" @update:model-value="onRange" />
        <el-button type="primary" @click="load(1)">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
        <el-button @click="reset">
          <template #icon><AppIcon icon="mdi-refresh" /></template>
          {{ t('reset') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="logs" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.businessEvent="{ item }">
        <el-tag v-if="item.businessEvent" size="small" effect="plain">{{ item.businessEvent }}</el-tag>
        <span v-else>-</span>
      </template>
      <template #item.feature="{ item }">{{ tFeature(item.featureKey, item.featureFallback) }}</template>
      <template #item.statusCode="{ item }">
        <span :class="(item.statusCode ?? 200) >= 400 ? 'text-error' : ''">{{ item.statusCode ?? '-' }}</span>
      </template>
      <template #item.actions="{ item }">
        <el-button text size="small" @click="toggleExpand(item.id)">
          <AppIcon icon="mdi-chevron-down" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <!-- 展开详情 -->
    <el-card v-if="expanded" shadow="never" class="mt-2">
      <template #header>{{ t('statistics') }}</template>
      <div class="d-flex flex-column ga-3">
        <!-- A-1 字段级变更留痕（业务语言：字段 X 从 A → B） -->
        <div v-if="changes.length" class="d-flex ga-2">
          <span class="text-body-2 text-medium-emphasis" style="min-width: 100px">{{ t('changesLabel') }}</span>
          <div class="d-flex flex-column ga-1">
            <div v-for="(c, i) in changes" :key="i" class="d-flex ga-1 align-center">
              <code class="text-body-2">{{ c.field }}</code>
              <span class="text-medium-emphasis">→</span>
              <span class="text-body-2 font-weight-medium">{{ c.after }}</span>
              <span v-if="c.before != null" class="text-caption text-medium-emphasis">({{ t('wasLabel') }} {{ c.before }})</span>
            </div>
          </div>
        </div>
        <!-- L3 技术详情：请求体折叠（业务化原则：技术信息点击详情再查看） -->
        <div v-if="expanded.requestBody" class="d-flex ga-2">
          <span class="text-body-2 text-medium-emphasis" style="min-width: 100px">requestBody</span>
          <pre class="text-body-2 ma-0">{{ prettyJson(expanded.requestBody) }}</pre>
        </div>
        <div v-if="expanded.ip" class="d-flex ga-2">
          <span class="text-body-2 text-medium-emphasis" style="min-width: 100px">IP</span>
          <span class="text-body-2">{{ expanded.ip }}</span>
        </div>
        <div v-if="expanded.userAgent" class="d-flex ga-2">
          <span class="text-body-2 text-medium-emphasis" style="min-width: 100px">User-Agent</span>
          <span class="text-body-2">{{ expanded.userAgent }}</span>
        </div>
      </div>
    </el-card>
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
  { key: 'businessEvent', title: t('businessEventCol') },
  { key: 'feature', title: t('featureCol') },
  { key: 'path', title: t('pathCol') },
  { key: 'statusCode', title: t('statusCol') },
  { key: 'actions', title: '' },
])

/** A-1 字段级变更留痕：解析 changes JSON 为 [{ field, before, after }] */
const changes = computed<Array<{ field: string; before: string | null; after: string }>>(() => {
  if (!expanded.value?.changes) return []
  try {
    const parsed = JSON.parse(expanded.value.changes)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

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

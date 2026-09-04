<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('monitorTitle')" />

    <el-row :gutter="16" v-if="summary">
      <el-col :xs="24">
        <el-card shadow="never" class="mb-4">
          <div class="d-flex flex-wrap ga-6 align-center">
            <div class="d-flex align-center ga-2">
              <StatusChip :status="summary.health.status" :label-map="statusLabelMap" />
              <span class="text-body-2">{{ t('serviceStatus', { status: summary.health.status }) }}</span>
            </div>
            <div class="text-body-2">{{ t('uptime', { time: formatUptime(summary.health.uptimeSec) }) }}</div>
            <div class="text-body-2 text-medium-emphasis">v{{ summary.health.version }}</div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24">
        <el-card shadow="never" class="mb-4">
          <template #header>{{ t('keyMetrics') }}</template>
          <el-row :gutter="16">
            <el-col v-for="m in metrics" :key="m.label" :xs="12" :md="6">
              <StatCard v-bind="m" />
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="mb-4">
          <template #header>{{ t('dependencies') }}</template>
          <div class="d-flex flex-column ga-1">
            <div v-for="(v, k) in summary.dependencies" :key="k" class="d-flex justify-space-between align-center text-body-2">
              <span>{{ t(k) }}</span>
              <StatusChip :status="v" :label-map="depLabelMap" />
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="mb-4">
          <template #header>{{ t('dataScale') }}</template>
          <div class="d-flex flex-column ga-1">
            <div v-for="(v, k) in summary.counts" :key="k" class="d-flex justify-space-between text-body-2">
              <span>{{ t(k) }}</span>
              <span class="text-medium-emphasis">{{ v }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24">
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex justify-space-between align-center">
              <span>{{ t('externalSystems') }}</span>
              <el-button size="small" text type="primary" @click="loadProxy">{{ t('refresh') }}</el-button>
            </div>
          </template>
          <div v-if="proxyInt && proxyInt.configured" class="d-flex flex-column ga-3">
            <div class="d-flex flex-wrap ga-6 align-center">
              <div class="d-flex align-center ga-2">
                <StatusChip :status="proxyChip(proxyInt)" :label-map="proxyLabelMap" />
                <span class="text-body-2">{{ proxyInt.audience ?? '-' }}</span>
              </div>
              <div class="text-body-2 text-medium-emphasis">{{ proxyInt.baseUrl }}</div>
              <div class="text-body-2">{{ t('configuredTools', { n: proxyInt.configuredTools ?? 0 }) }}</div>
              <div v-if="proxyInt.delegation?.configured" class="text-body-2">
                <el-tag size="small" type="success" effect="plain">Delegation</el-tag>
              </div>
              <div v-if="proxyInt.audit?.configured" class="text-body-2">
                <el-tag size="small" type="success" effect="plain">Audit</el-tag>
              </div>
            </div>
            <el-alert v-if="proxyInt.error" :title="proxyInt.error" type="warning" :closable="false" />
          </div>
          <div v-else class="text-body-2 text-medium-emphasis">{{ t('noExternalSystem') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <div v-else-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusChip from '@/components/StatusChip.vue'
import { adminApi } from '@/api/admin'
import { formatUptime } from '@/utils/format'
import type { MonitorSummary, ProxyIntegrationStatus } from '@/types/admin'

const { t } = useI18n()
const summary = ref<MonitorSummary | null>(null)
const proxyInt = ref<ProxyIntegrationStatus | null>(null)
const loading = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

const statusLabelMap = computed(() => ({ ok: t('statusOk'), error: t('statusError'), degraded: t('statusError') }))
const depLabelMap = computed(() => ({ up: t('ok'), ok: t('ok'), down: t('statusError'), error: t('statusError') }))
// Java /keelbase/status 接入状态 → StatusChip 状态 + 文案
const proxyLabelMap = computed(() => ({
  ok: t('proxyHealthy'),
  error: t('statusError'),
  unreachable: t('proxyUnreachable'),
  noStatus: t('proxyNoStatus'),
}))
function proxyChip(p: ProxyIntegrationStatus): string {
  if (!p.reachable) return 'unreachable'
  if (!p.statusEnabled) return 'noStatus'
  return p.health?.status === 'DOWN' ? 'error' : 'ok'
}

const metrics = computed(() => {
  const m = summary.value?.metrics
  return [
    { label: t('requestRate'), value: m?.requestRateRps ?? '-', icon: 'mdi-speedometer', color: 'primary' },
    { label: t('errorRate'), value: m?.errorRatePct != null ? `${m.errorRatePct}%` : '-', icon: 'mdi-alert-circle-outline', color: m?.errorRatePct ? 'error' : 'success' },
    { label: t('latencyP95'), value: m?.latencyP95Ms != null ? `${m.latencyP95Ms}ms` : '-', icon: 'mdi-timer-outline', color: 'info' },
    { label: t('inFlight'), value: m?.inFlight ?? '-', icon: 'mdi-lan', color: 'warning' },
  ]
})

async function load() {
  try {
    summary.value = await adminApi.monitorSummary()
  } catch {
    // global snackbar
  } finally {
    loading.value = false
  }
}

async function loadProxy() {
  try {
    proxyInt.value = await adminApi.proxyIntegrationsStatus()
  } catch {
    // global snackbar
  }
}

onMounted(() => {
  load()
  loadProxy()
  timer = setInterval(load, 15000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

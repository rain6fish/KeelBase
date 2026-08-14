<template>
  <div>
    <PageHeader :title="t('monitorTitle')" />

    <v-row v-if="summary">
      <v-col cols="12">
        <v-card>
          <v-card-text class="d-flex flex-wrap ga-6 align-center">
            <div class="d-flex align-center ga-2">
              <StatusChip :status="summary.health.status" :label-map="statusLabelMap" />
              <span class="text-body-2">{{ t('serviceStatus', { status: summary.health.status }) }}</span>
            </div>
            <div class="text-body-2">{{ t('uptime', { time: formatUptime(summary.health.uptimeSec) }) }}</div>
            <div class="text-body-2 text-medium-emphasis">v{{ summary.health.version }}</div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card>
          <v-card-title>{{ t('keyMetrics') }}</v-card-title>
          <v-card-text>
            <v-row>
              <v-col v-for="m in metrics" :key="m.label" cols="6" md="3">
                <StatCard v-bind="m" />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>{{ t('dependencies') }}</v-card-title>
          <v-card-text class="d-flex flex-column ga-1">
            <div v-for="(v, k) in summary.dependencies" :key="k" class="d-flex justify-space-between align-center text-body-2">
              <span>{{ t(k) }}</span>
              <StatusChip :status="v" :label-map="depLabelMap" />
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>{{ t('dataScale') }}</v-card-title>
          <v-card-text class="d-flex flex-column ga-1">
            <div v-for="(v, k) in summary.counts" :key="k" class="d-flex justify-space-between text-body-2">
              <span>{{ t(k) }}</span>
              <span class="text-medium-emphasis">{{ v }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

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
import type { MonitorSummary } from '@/types/admin'

const { t } = useI18n()
const summary = ref<MonitorSummary | null>(null)
const loading = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

const statusLabelMap = computed(() => ({ ok: t('statusOk'), error: t('statusError'), degraded: t('statusError') }))
const depLabelMap = computed(() => ({ up: t('ok'), ok: t('ok'), down: t('statusError'), error: t('statusError') }))

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

onMounted(() => {
  load()
  timer = setInterval(load, 15000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

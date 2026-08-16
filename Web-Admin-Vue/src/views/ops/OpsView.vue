<template>
  <div>
    <PageHeader :title="t('opsTitle')" :subtitle="t('opsSubtitle')">
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :disabled="loading" @click="load">
        {{ t('refresh') }}
      </v-btn>
    </PageHeader>

    <!-- 加载失败：错误提示 + 重试 -->
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ t('loadFailed') }}
      <template #append>
        <v-btn variant="text" color="error" @click="load">{{ t('retry') }}</v-btn>
      </template>
    </v-alert>

    <!-- 加载中：骨架屏 -->
    <div v-else-if="loading">
      <v-skeleton-loader type="card-heading, list-item-two-line" class="mb-4" />
      <v-skeleton-loader type="heading, list-item-three-line" />
    </div>

    <template v-else-if="summary">
      <!-- 派生告警 -->
      <v-card class="mb-4">
        <v-card-title>{{ t('opsAlerts') }}</v-card-title>
        <v-card-text>
          <div v-if="summary.alerts.length" class="d-flex flex-column ga-2">
            <v-alert
              v-for="a in summary.alerts"
              :key="`${a.level}-${a.title}`"
              :type="a.level === 'critical' ? 'error' : 'warning'"
              variant="tonal"
            >
              <div class="d-flex align-center ga-2">
                <v-chip size="small" :color="a.level === 'critical' ? 'error' : 'warning'" variant="flat">
                  {{ t(a.level === 'critical' ? 'opsCritical' : 'opsWarning') }}
                </v-chip>
                <span class="font-weight-bold">{{ a.title }}</span>
              </div>
              <div class="mt-1">{{ a.detail }}</div>
            </v-alert>
          </div>
          <v-alert v-else type="success" variant="tonal">{{ t('opsNoAlerts') }}</v-alert>
        </v-card-text>
      </v-card>

      <!-- 关键指标 -->
      <v-card class="mb-4">
        <v-card-title>{{ t('keyMetrics') }}</v-card-title>
        <v-card-text>
          <v-row>
            <v-col v-for="m in metrics" :key="m.label" cols="6" md="3">
              <StatCard v-bind="m" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- 近 24h 错误摘要 + 7 天操作趋势 -->
      <v-row>
        <v-col cols="12" md="6">
          <v-card class="h-100">
            <v-card-title>{{ t('opsLogErrors') }}</v-card-title>
            <v-card-text class="d-flex flex-column ga-2">
              <div class="text-caption text-medium-emphasis">{{ t('opsSince', { time: formatTime(summary.logErrors.since) }) }}</div>
              <div class="d-flex align-center ga-2">
                <span class="text-body-2">{{ t('opsOpErrors') }}</span>
                <template v-if="summary.logErrors.opErrors.length">
                  <v-chip
                    v-for="e in summary.logErrors.opErrors"
                    :key="e.code"
                    size="small"
                    color="error"
                    variant="tonal"
                  >
                    {{ e.code }} × {{ e.count }}
                  </v-chip>
                </template>
                <span v-else class="text-body-2 text-medium-emphasis">{{ t('opsNoOpErrors') }}</span>
              </div>
              <div class="d-flex align-center ga-2">
                <span class="text-body-2">{{ t('opsAiErrors') }}</span>
                <v-chip size="small" :color="summary.logErrors.aiErrors ? 'error' : 'success'" variant="tonal">
                  {{ summary.logErrors.aiErrors }}
                </v-chip>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card class="h-100">
            <v-card-title>{{ t('opsTrend') }}</v-card-title>
            <v-card-text>
              <v-table v-if="summary.trend.length" density="compact">
                <thead>
                  <tr>
                    <th>{{ t('opsDayCol') }}</th>
                    <th>{{ t('opsTotalCol') }}</th>
                    <th>{{ t('opsErrorCol') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in summary.trend" :key="row.day">
                    <td>{{ row.day }}</td>
                    <td>{{ row.total }}</td>
                    <td>{{ row.errors }}</td>
                  </tr>
                </tbody>
              </v-table>
              <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- 四工具速查卡 -->
      <v-card class="mt-4">
        <v-card-title>{{ t('opsTools') }}</v-card-title>
        <v-card-text>
          <div class="text-body-2 text-medium-emphasis mb-3">{{ t('opsToolsHint') }}</div>
          <v-row>
            <v-col v-for="tool in tools" :key="tool.key" cols="12" sm="6" md="3">
              <v-card hover class="h-100" @click="open(tool.url)">
                <v-card-text>
                  <div class="d-flex align-center ga-2 mb-1">
                    <v-icon :icon="tool.icon" :color="tool.color" />
                    <span class="text-h6">{{ tool.name }}</span>
                  </div>
                  <div class="text-body-2 text-medium-emphasis">{{ t(tool.questionKey) }}</div>
                  <div class="text-caption text-medium-emphasis mt-2">{{ tool.url }}</div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { adminApi } from '@/api/admin'
import { OBSERVABILITY_URLS } from '@/utils/constants'
import { formatTime } from '@/utils/format'
import type { OpsSummary } from '@/types/admin'

const { t } = useI18n()
const summary = ref<OpsSummary | null>(null)
const loading = ref(true)
const error = ref(false)

const metrics = computed(() => {
  const m = summary.value?.metrics
  return [
    { label: t('requestRate'), value: m?.requestRateRps ?? '-', icon: 'mdi-speedometer', color: 'primary' },
    { label: t('errorRate'), value: m?.errorRatePct != null ? `${m.errorRatePct}%` : '-', icon: 'mdi-alert-circle-outline', color: m?.errorRatePct ? 'error' : 'success' },
    { label: t('latencyP95'), value: m?.latencyP95Ms != null ? `${m.latencyP95Ms}ms` : '-', icon: 'mdi-timer-outline', color: 'info' },
    { label: t('inFlight'), value: m?.inFlight ?? '-', icon: 'mdi-lan', color: 'warning' },
  ]
})

// 四工具速查卡：每张卡说明它「答什么问题」，点击直达对应系统
const tools = [
  { key: 'prometheus', name: 'Prometheus', icon: 'mdi-fire', color: 'error', questionKey: 'opsToolPrometheus', url: OBSERVABILITY_URLS.prometheus },
  { key: 'grafana', name: 'Grafana', icon: 'mdi-chart-box', color: 'primary', questionKey: 'opsToolGrafana', url: OBSERVABILITY_URLS.grafana },
  { key: 'jaeger', name: 'Jaeger', icon: 'mdi-graph-outline', color: 'success', questionKey: 'opsToolJaeger', url: OBSERVABILITY_URLS.jaeger },
  { key: 'loki', name: 'Loki', icon: 'mdi-database-eye', color: 'warning', questionKey: 'opsToolLoki', url: OBSERVABILITY_URLS.loki },
]

function open(url: string) {
  window.open(url, '_blank')
}

async function load() {
  loading.value = true
  error.value = false
  try {
    summary.value = await adminApi.opsSummary()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

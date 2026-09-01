<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('opsTitle')" :subtitle="t('opsSubtitle')">
      <el-button :disabled="loading" @click="load">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <!-- 加载失败：错误提示 + 重试 -->
    <el-alert v-if="error" type="error" :closable="false" class="mb-4">
      <div class="d-flex align-center ga-2">
        <span>{{ t('loadFailed') }}</span>
        <el-button text type="danger" size="small" @click="load">{{ t('retry') }}</el-button>
      </div>
    </el-alert>

    <!-- 加载中：骨架屏 -->
    <div v-else-if="loading">
      <el-skeleton animated :rows="4" class="mb-4" />
      <el-skeleton animated :rows="5" />
    </div>

    <template v-else-if="summary">
      <!-- 派生告警 -->
      <el-card shadow="never" class="mb-4">
        <template #header>{{ t('opsAlerts') }}</template>
        <div v-if="summary.alerts.length" class="d-flex flex-column ga-2">
          <el-alert
            v-for="a in summary.alerts"
            :key="`${a.level}-${a.title}`"
            :type="a.level === 'critical' ? 'error' : 'warning'"
            :closable="false"
          >
            <div class="d-flex align-center ga-2">
              <el-tag size="small" :type="a.level === 'critical' ? 'danger' : 'warning'" effect="dark">
                {{ t(a.level === 'critical' ? 'opsCritical' : 'opsWarning') }}
              </el-tag>
              <span class="font-weight-bold">{{ a.title }}</span>
            </div>
            <div class="mt-1">{{ a.detail }}</div>
          </el-alert>
        </div>
        <el-alert v-else type="success" :closable="false">{{ t('opsNoAlerts') }}</el-alert>
      </el-card>

      <!-- 关键指标 -->
      <el-card shadow="never" class="mb-4">
        <template #header>{{ t('keyMetrics') }}</template>
        <el-row :gutter="16">
          <el-col v-for="m in metrics" :key="m.label" :xs="12" :sm="12" :md="6">
            <StatCard v-bind="m" />
          </el-col>
        </el-row>
      </el-card>

      <!-- 近 24h 错误摘要 + 7 天操作趋势 -->
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="h-100 mb-4">
            <template #header>{{ t('opsLogErrors') }}</template>
            <div class="d-flex flex-column ga-2">
              <div class="text-caption text-medium-emphasis">{{ t('opsSince', { time: formatTime(summary.logErrors.since) }) }}</div>
              <div class="d-flex align-center ga-2">
                <span class="text-body-2">{{ t('opsOpErrors') }}</span>
                <template v-if="summary.logErrors.opErrors.length">
                  <el-tag
                    v-for="e in summary.logErrors.opErrors"
                    :key="e.code"
                    size="small"
                    type="danger"
                    effect="light"
                  >
                    {{ e.code }} × {{ e.count }}
                  </el-tag>
                </template>
                <span v-else class="text-body-2 text-medium-emphasis">{{ t('opsNoOpErrors') }}</span>
              </div>
              <div class="d-flex align-center ga-2">
                <span class="text-body-2">{{ t('opsAiErrors') }}</span>
                <el-tag size="small" :type="summary.logErrors.aiErrors ? 'danger' : 'success'" effect="light">
                  {{ summary.logErrors.aiErrors }}
                </el-tag>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="h-100 mb-4">
            <template #header>{{ t('opsTrend') }}</template>
            <el-table v-if="summary.trend.length" :data="summary.trend" size="small" border>
              <el-table-column :label="t('opsDayCol')" prop="day" />
              <el-table-column :label="t('opsTotalCol')" prop="total" />
              <el-table-column :label="t('opsErrorCol')" prop="errors" />
            </el-table>
            <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 四工具速查卡 -->
      <el-card shadow="never" class="mt-4">
        <template #header>{{ t('opsTools') }}</template>
        <div class="text-body-2 text-medium-emphasis mb-3">{{ t('opsToolsHint') }}</div>
        <el-row :gutter="16">
          <el-col v-for="tool in tools" :key="tool.key" :xs="24" :sm="12" :md="6">
            <el-card shadow="hover" class="h-100 mb-4 cursor-pointer" @click="open(tool.url)">
              <div class="d-flex align-center ga-2 mb-1">
                <AppIcon
                  :icon="tool.icon"
                  :color="tool.color === 'error' ? 'var(--el-color-error)' : 'var(--el-color-' + tool.color + ')'"
                />
                <span class="text-h6">{{ tool.name }}</span>
              </div>
              <div class="text-body-2 text-medium-emphasis">{{ t(tool.questionKey) }}</div>
              <div class="text-caption text-medium-emphasis mt-2">{{ tool.url }}</div>
            </el-card>
          </el-col>
        </el-row>
      </el-card>
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

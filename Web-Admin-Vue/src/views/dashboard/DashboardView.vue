<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div v-loading="loading">
    <PageHeader :title="t('overview')" />

    <!-- E-3 onboarding：首次进入引导（可关闭） -->
    <el-alert v-if="showOnboard" type="info" show-icon :closable="true" class="mb-4" @close="dismissOnboard">
      <template #title>{{ t('onboardTitle') }}</template>
      <div class="text-body-2">
        {{ t('onboardContent') }}
        <el-link type="primary" class="mx-1" @click="$router.push('/ai/chat')">{{ t('sysAssistant') }}</el-link>·
        <el-link type="primary" class="mx-1" @click="$router.push('/guard-overview')">{{ t('navGuardOverview') }}</el-link>
      </div>
    </el-alert>

    <!-- NC-3 首次运行就绪清单（五维 + 每维可执行下一步；数据来自公开端点 /app/readiness） -->
    <el-card v-if="readiness" class="mb-4" shadow="never">
      <template #header>
        <div class="d-flex align-center justify-space-between">
          <span class="font-weight-medium">{{ t('readinessTitle') }}</span>
          <el-tag :type="readiness.ready ? 'success' : 'warning'" size="small">
            {{ readiness.ready ? t('readinessCoreReady') : t('readinessCorePending') }}
          </el-tag>
        </div>
      </template>
      <el-table :data="readinessRows" size="small" :show-header="false">
        <el-table-column prop="label" width="150" />
        <el-table-column width="100">
          <template #default="{ row }">
            <el-tag :type="row.ready ? 'success' : 'info'" size="small" effect="plain">
              {{ row.ready ? t('readinessOk') : t('readinessTodo') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" />
        <el-table-column width="340">
          <template #default="{ row }">
            <code v-if="row.nextStep" class="text-caption">{{ row.nextStep }}</code>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 统计卡：与 AI 审计一致（xs 2 列 + 底部间距） -->
    <el-row :gutter="16" class="mb-2">
      <el-col v-for="card in statCards" :key="card.label" :xs="12" :md="6">
        <StatCard v-bind="card" />
      </el-col>
    </el-row>

    <!-- P2③ admin 可看：Trust 旅程跨访客完成统计（今日 / 累计），一键去沙盘 -->
    <el-card shadow="never" class="mb-4">
      <div class="d-flex align-center justify-space-between flex-wrap gap-2">
        <span class="d-flex align-center ga-2 flex-wrap">
          <AppIcon icon="mdi-shield-check-outline" color="var(--el-color-primary)" />
          <span class="text-subtitle-1">{{ t('trustJourneyTitle') }}</span>
          <span class="text-body-2 text-medium-emphasis">
            {{ t('journeyServerStats', { t: journeyStats.today, n: journeyStats.total }) }}
          </span>
        </span>
        <el-button size="small" plain @click="$router.push('/workbench/trust-sandbox')">
          <AppIcon icon="mdi-rocket-launch-outline" class="mr-1" />{{ t('trustJourneyStart') }}
        </el-button>
      </div>
    </el-card>

    <el-row :gutter="16">
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="mb-4">
          <template #header>{{ t('newUsers7d') }}</template>
          <div v-if="trend.length" class="d-flex align-end ga-1" style="height: 120px">
            <div
              v-for="item in trend"
              :key="item.date"
              class="trend-bar flex-grow-1"
              :style="{ height: `${barHeight(item.count)}%` }"
              :title="`${item.date}: ${item.count}`"
            />
          </div>
          <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8" class="mb-4">
        <el-card shadow="never">
          <template #header>{{ t('actionDistribution') }}</template>
          <div v-if="topActions.length">
            <div class="d-flex justify-space-between align-center text-caption text-medium-emphasis pb-1 mb-1" style="border-bottom: 1px solid var(--el-border-color-lighter)">
              <span>{{ t('actionCol') }}</span>
              <span>#</span>
            </div>
            <div v-for="a in topActions" :key="a.action" class="d-flex justify-space-between align-center py-1">
              <span class="text-body-2">{{ a.action }}</span>
              <el-tag size="small" effect="plain" round>{{ a.count }}</el-tag>
            </div>
          </div>
          <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import AppIcon from '@/components/AppIcon.vue'
import { adminApi } from '@/api/admin'
import { auditApi } from '@/api/audit'
import { aiApi } from '@/api/ai'
import { api } from '@/api/client'

/** NC-3 就绪清单：单维 {ready, detail, nextStep}（与后端 ReadinessService 同形） */
type ReadinessDim = { ready: boolean; detail: string; nextStep: string | null }
type Readiness = { ready: boolean; checkedAt: string; dimensions: Record<string, ReadinessDim> }

/** 维度 key → i18n 标签 key（未知 key 原样显示，便于后端加维度时不静默丢） */
const READINESS_LABEL_KEYS: Record<string, string> = {
  runtime: 'readinessRuntime',
  db: 'readinessDb',
  ai: 'readinessAi',
  governance: 'readinessGovernance',
  demo: 'readinessDemo',
}

const { t } = useI18n()
// E-3 onboarding：首次进入控制台显示引导横幅（可关闭，localStorage 记忆）
const ONBOARD_KEY = 'keelbase_console_onboarded'
const showOnboard = ref(typeof window !== 'undefined' && !localStorage.getItem(ONBOARD_KEY))
function dismissOnboard() {
  showOnboard.value = false
  localStorage.setItem(ONBOARD_KEY, '1')
}
const loading = ref(false)
const counts = ref<Record<string, number>>({})
const storage = ref<{ driver: string; bytes: number | null }>({ driver: '-', bytes: null })
const trend = ref<Array<{ date: string; count: number }>>([])
const topActions = ref<Array<{ action: string; count: number }>>([])
const journeyStats = ref<{ today: number; total: number }>({ today: 0, total: 0 })

/** NC-3 首次运行就绪清单（失败不阻塞概览：卡片整体隐藏） */
const readiness = ref<Readiness | null>(null)
const readinessRows = computed(() =>
  Object.entries(readiness.value?.dimensions ?? {}).map(([key, dim]) => ({
    key,
    label: t(READINESS_LABEL_KEYS[key] ?? key),
    ...dim,
  })),
)

async function load() {
  loading.value = true
  try {
    const [overview, stats] = await Promise.all([adminApi.overview(7), auditApi.stats()])
    counts.value = overview.counts as Record<string, number>
    storage.value = overview.storage
    trend.value = overview.trend
    topActions.value = stats.topActions
  } catch {
    // snackbar handled globally
  } finally {
    loading.value = false
  }
}

const statCards = computed(() => [
  { label: t('users'), value: counts.value.users ?? '-', icon: 'mdi-account-group-outline', color: 'primary' },
  { label: t('events'), value: counts.value.events ?? '-', icon: 'mdi-calendar-blank-outline', color: 'success' },
  { label: t('notifications'), value: counts.value.notifications ?? '-', icon: 'mdi-bell-outline', color: 'info' },
  { label: t('aiUsage'), value: `${counts.value.aiAuditLogs ?? '-'}`, icon: 'mdi-robot-outline', color: 'warning', hint: t('storageDriver', { driver: storage.value.driver }) },
])

const maxCount = computed(() => Math.max(1, ...trend.value.map((x) => x.count)))
function barHeight(n: number): number {
  return Math.max(4, (n / maxCount.value) * 100)
}

onMounted(async () => {
  await load()
  // NC-3 就绪清单：补充信息，独立非阻塞取（失败静默隐藏卡片，不拖慢概览主数据）
  void api
    .get<Readiness>('/app/readiness')
    .then((r) => {
      readiness.value = r
    })
    .catch(() => {})
  aiApi
    .trustSandboxJourneyStats()
    .then((js) => {
      journeyStats.value = { today: js.today, total: js.total }
    })
    .catch(() => {})
})
</script>

<style scoped>
/* 趋势条：主题渐变 + 圆角顶 + hover 提亮 */
.trend-bar {
  background: linear-gradient(180deg, var(--keel-brand-gradient-to, var(--el-color-primary)) 0%, var(--el-color-primary) 100%);
  border-radius: 6px 6px 0 0;
  opacity: 0.88;
  transition: opacity 0.15s ease;
  min-height: 4px;
}
.trend-bar:hover {
  opacity: 1;
}
</style>

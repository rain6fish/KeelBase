<template>
  <div>
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

    <!-- 统计卡：与 AI 审计一致（xs 2 列 + 底部间距） -->
    <el-row :gutter="16" class="mb-2">
      <el-col v-for="card in statCards" :key="card.label" :xs="12" :md="6">
        <StatCard v-bind="card" />
      </el-col>
    </el-row>

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
import { adminApi } from '@/api/admin'
import { auditApi } from '@/api/audit'

const { t } = useI18n()
// E-3 onboarding：首次进入控制台显示引导横幅（可关闭，localStorage 记忆）
const ONBOARD_KEY = 'keelbase_console_onboarded'
const showOnboard = ref(typeof window !== 'undefined' && !localStorage.getItem(ONBOARD_KEY))
function dismissOnboard() {
  showOnboard.value = false
  localStorage.setItem(ONBOARD_KEY, '1')
}
const counts = ref<Record<string, number>>({})
const storage = ref<{ driver: string; bytes: number | null }>({ driver: '-', bytes: null })
const trend = ref<Array<{ date: string; count: number }>>([])
const topActions = ref<Array<{ action: string; count: number }>>([])

async function load() {
  try {
    const [overview, stats] = await Promise.all([adminApi.overview(7), auditApi.stats()])
    counts.value = overview.counts as Record<string, number>
    storage.value = overview.storage
    trend.value = overview.trend
    topActions.value = stats.topActions
  } catch {
    // snackbar handled globally
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

onMounted(load)
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

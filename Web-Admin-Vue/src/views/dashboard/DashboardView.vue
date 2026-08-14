<template>
  <div>
    <PageHeader :title="t('overview')" />

    <v-row>
      <v-col v-for="card in statCards" :key="card.label" cols="12" sm="6" md="3">
        <StatCard v-bind="card" />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="8">
        <v-card>
          <v-card-title>{{ t('newUsers7d') }}</v-card-title>
          <v-card-text>
            <div v-if="trend.length" class="d-flex align-end ga-1" style="height: 120px">
              <div
                v-for="item in trend"
                :key="item.date"
                class="flex-grow-1 rounded-sm"
                style="background: rgb(var(--v-theme-primary))"
                :style="{ height: `${barHeight(item.count)}%` }"
                :title="`${item.date}: ${item.count}`"
              />
            </div>
            <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>{{ t('actionDistribution') }}</v-card-title>
          <v-card-text>
            <div v-if="topActions.length" class="d-flex flex-column ga-1">
              <div v-for="a in topActions" :key="a.action" class="d-flex justify-space-between text-body-2">
                <span>{{ a.action }}</span>
                <span class="text-medium-emphasis">{{ a.count }}</span>
              </div>
            </div>
            <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
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

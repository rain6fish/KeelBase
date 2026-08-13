<template>
  <div>
    <PageHeader :title="t('navAnalytics')">
      <v-select
        v-model="days"
        :items="[7, 30, 90]"
        item-title="days"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 120px"
        :label="t('days')"
        @update:model-value="load()"
      />
    </PageHeader>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <template v-else-if="data">
      <v-row>
        <v-col cols="12" sm="6" md="3">
          <StatCard :label="t('wau')" :value="data.activeUsers.wau" icon="mdi-account-group-outline" color="primary" />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <StatCard :label="t('mau')" :value="data.activeUsers.mau" icon="mdi-account-multiple-outline" color="success" />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <StatCard :label="t('retention')" :value="`${data.retention.ratePct}%`" icon="mdi-percent-outline" color="info" />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <StatCard :label="t('aiErrors')" :value="data.errors.aiErrors" icon="mdi-alert-circle-outline" color="error" />
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" md="7">
          <v-card>
            <v-card-title>{{ t('dailyActiveUsers') }}</v-card-title>
            <v-card-text>
              <div v-if="data.activeUsers.daily.length" class="d-flex align-end ga-1" style="height: 160px">
                <div
                  v-for="d in data.activeUsers.daily"
                  :key="d.date"
                  class="flex-grow-1 rounded-sm"
                  style="background: rgb(var(--v-theme-primary))"
                  :style="{ height: `${barHeight(d.count)}%` }"
                  :title="`${d.date}: ${d.count}`"
                />
              </div>
              <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="5">
          <v-card>
            <v-card-title>{{ t('featureFunnel') }}</v-card-title>
            <v-card-text>
              <div v-if="data.featureFunnel.length" class="d-flex flex-column ga-1">
                <div v-for="f in data.featureFunnel" :key="f.action" class="d-flex justify-space-between text-body-2">
                  <span>{{ f.action }}</span>
                  <span class="text-medium-emphasis">{{ f.count }}</span>
                </div>
              </div>
              <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-card class="mt-4">
        <v-card-title>{{ t('errorTrend') }}</v-card-title>
        <v-card-text>
          <div v-if="data.errors.trend.length" class="d-flex align-end ga-1" style="height: 100px">
            <div
              v-for="e in data.errors.trend"
              :key="e.date"
              class="flex-grow-1 rounded-sm"
              style="background: rgb(var(--v-theme-error))"
              :style="{ height: `${errBarHeight(e.count)}%` }"
              :title="`${e.date}: ${e.count}`"
            />
          </div>
          <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
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
import type { AnalyticsResponse } from '@/types/admin'

const { t } = useI18n()
const data = ref<AnalyticsResponse | null>(null)
const loading = ref(true)
const days = ref(30)

const maxDaily = computed(() => Math.max(1, ...(data.value?.activeUsers.daily.map((d) => d.count) ?? [0])))
const maxErr = computed(() => Math.max(1, ...(data.value?.errors.trend.map((e) => e.count) ?? [0])))
function barHeight(n: number): number {
  return Math.max(4, (n / maxDaily.value) * 100)
}
function errBarHeight(n: number): number {
  return Math.max(4, (n / maxErr.value) * 100)
}

async function load() {
  loading.value = true
  try {
    data.value = await adminApi.analytics(days.value)
  } catch {
    // global snackbar
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

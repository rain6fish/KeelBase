<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navAnalytics')">
      <el-select v-model="days" :label="t('days')" style="max-width: 120px" @update:model-value="load()">
        <el-option v-for="s in [7, 30, 90]" :key="s" :label="String(s)" :value="s" />
      </el-select>
    </PageHeader>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <template v-else-if="data">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="12" :md="6">
          <StatCard :label="t('wau')" :value="data.activeUsers.wau" icon="mdi-account-group-outline" color="primary" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <StatCard :label="t('mau')" :value="data.activeUsers.mau" icon="mdi-account-multiple-outline" color="success" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <StatCard :label="t('retention')" :value="`${data.retention.ratePct}%`" icon="mdi-percent-outline" color="info" />
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <StatCard :label="t('aiErrors')" :value="data.errors.aiErrors" icon="mdi-alert-circle-outline" color="error" />
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :md="14">
          <el-card shadow="never">
            <template #header>{{ t('dailyActiveUsers') }}</template>
            <div v-if="data.activeUsers.daily.length" class="d-flex align-end ga-1" style="height: 160px">
              <div
                v-for="d in data.activeUsers.daily"
                :key="d.date"
                class="flex-grow-1 rounded-sm"
                style="background: var(--el-color-primary)"
                :style="{ height: `${barHeight(d.count)}%` }"
                :title="`${d.date}: ${d.count}`"
              />
            </div>
            <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="10">
          <el-card shadow="never">
            <template #header>{{ t('featureFunnel') }}</template>
            <div v-if="data.featureFunnel.length" class="d-flex flex-column ga-1">
              <div v-for="f in data.featureFunnel" :key="f.action" class="d-flex justify-space-between text-body-2">
                <span>{{ f.action }}</span>
                <span class="text-medium-emphasis">{{ f.count }}</span>
              </div>
            </div>
            <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="mt-4">
        <template #header>{{ t('errorTrend') }}</template>
        <div v-if="data.errors.trend.length" class="d-flex align-end ga-1" style="height: 100px">
          <div
            v-for="e in data.errors.trend"
            :key="e.date"
            class="flex-grow-1 rounded-sm"
            style="background: var(--el-color-danger)"
            :style="{ height: `${errBarHeight(e.count)}%` }"
            :title="`${e.date}: ${e.count}`"
          />
        </div>
        <div v-else class="text-medium-emphasis">{{ t('noTrend') }}</div>
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

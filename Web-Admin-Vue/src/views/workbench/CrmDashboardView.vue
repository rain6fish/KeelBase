<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('aiIntelligence')" :subtitle="t('aiIntelligenceHint')">
      <el-button @click="load">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <template v-else>
      <el-row :gutter="16" class="mb-4">
        <el-col v-for="card in cards" :key="card.label" :xs="12" :sm="8" :md="6" :lg="4" class="mb-4">
          <StatCard v-bind="card" />
        </el-col>
      </el-row>

      <!-- AI 建议动作：基于指标派生的下一步（P0 AI Intelligence Dashboard 的「建议动作」） -->
      <el-card shadow="never">
        <template #header>
          <div class="d-flex align-center ga-2">
            <AppIcon icon="mdi-lightbulb-on-outline" color="var(--el-color-primary)" />
            <span class="text-subtitle-1">{{ t('recommendedActions') }}</span>
          </div>
        </template>
        <div class="d-flex flex-column ga-2">
          <div v-if="d.highRiskCustomers > 0" class="text-body-2">
            <el-tag size="small" type="danger" effect="light" class="mr-2">{{ t('highRisk') }}</el-tag>
            {{ t('recommendFollowHighRisk', { n: d.highRiskCustomers }) }}
          </div>
          <div v-if="d.overdueOrders > 0" class="text-body-2">
            <el-tag size="small" type="warning" effect="light" class="mr-2">{{ t('overdue') }}</el-tag>
            {{ t('recommendCollectOverdue', { n: d.overdueOrders }) }}
          </div>
          <div v-if="d.soonClosing > 0" class="text-body-2">
            <el-tag size="small" type="success" effect="light" class="mr-2">{{ t('soonClosing') }}</el-tag>
            {{ t('recommendFollowOpportunity', { n: d.soonClosing }) }}
          </div>
          <div v-if="d.openRisks > 0" class="text-body-2">
            <el-tag size="small" type="warning" effect="light" class="mr-2">{{ t('openRisks') }}</el-tag>
            {{ t('recommendResolveRisk', { n: d.openRisks }) }}
          </div>
          <div v-if="d.openTasks === 0 && d.highRiskCustomers === 0 && d.overdueOrders === 0 && d.openRisks === 0" class="text-body-2 text-medium-emphasis">
            {{ t('allClear') }}
          </div>
        </div>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { crmApi, type CrmDashboard } from '@/api/crm'

const { t } = useI18n()
const snackbar = useSnackbarStore()
const d = ref<CrmDashboard>({
  customers: 0, highRiskCustomers: 0, opportunities: 0, pipelineAmount: 0,
  weightedAmount: 0, soonClosing: 0, overdueOrders: 0, openTasks: 0, openRisks: 0,
})
const loading = ref(false)

const cards = computed(() => [
  { label: t('crmCustomers'), value: d.value.customers, icon: 'mdi-account-group-outline', color: 'primary' },
  { label: t('highRiskCustomers'), value: d.value.highRiskCustomers, icon: 'mdi-alert-octagon-outline', color: d.value.highRiskCustomers > 0 ? 'error' : 'success' },
  { label: t('opportunities'), value: d.value.opportunities, icon: 'mdi-target', color: 'info' },
  { label: t('pipelineAmount'), value: formatMoney(d.value.pipelineAmount), icon: 'mdi-currency-cny', color: 'primary' },
  { label: t('weightedAmount'), value: formatMoney(d.value.weightedAmount), icon: 'mdi-chart-line', color: 'info' },
  { label: t('soonClosing'), value: d.value.soonClosing, icon: 'mdi-calendar-clock', color: 'success' },
  { label: t('overdueOrders'), value: d.value.overdueOrders, icon: 'mdi-timer-sand', color: d.value.overdueOrders > 0 ? 'error' : 'success' },
  { label: t('openTasks'), value: d.value.openTasks, icon: 'mdi-clipboard-text-outline', color: 'warning' },
  { label: t('openRisks'), value: d.value.openRisks, icon: 'mdi-shield-alert-outline', color: d.value.openRisks > 0 ? 'warning' : 'success' },
])

function formatMoney(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n)
}

async function load() {
  loading.value = true
  try {
    d.value = await crmApi.dashboard()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

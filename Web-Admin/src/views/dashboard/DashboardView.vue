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
          <v-card-text class="text-medium-emphasis">
            {{ t('noTrend') }}
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>{{ t('actionDistribution') }}</v-card-title>
          <v-card-text class="text-medium-emphasis">
            {{ t('noTrend') }}
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const { t } = useI18n()

// P2：接入 GET /admin/overview + /audit/stats 真实数据
const statCards = computed(() => [
  { label: t('users'), value: '-', icon: 'mdi-account-group-outline', color: 'primary' },
  { label: t('events'), value: '-', icon: 'mdi-calendar-blank-outline', color: 'success' },
  { label: t('notifications'), value: '-', icon: 'mdi-bell-outline', color: 'info' },
  { label: t('totalTokens'), value: '-', icon: 'mdi-database-outline', color: 'warning' },
])
</script>

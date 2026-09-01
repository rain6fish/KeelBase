<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('obsTitle')" />

    <el-alert type="info" :closable="false" class="mb-4">
      {{ t('obsHint') }}
    </el-alert>

    <el-row :gutter="16">
      <el-col v-for="sys in systems" :key="sys.key" :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="text-center pa-4 cursor-pointer mb-4" @click="open(sys.url)">
          <AppIcon
            :icon="sys.icon"
            :size="42"
            :color="sys.color === 'error' ? 'var(--el-color-error)' : 'var(--el-color-' + sys.color + ')'"
            class="mb-2"
          />
          <div class="text-h6">{{ sys.label }}</div>
          <div class="text-caption text-medium-emphasis">{{ sys.url }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import { OBSERVABILITY_URLS } from '@/utils/constants'

const { t } = useI18n()

const systems = [
  { key: 'grafana', label: 'Grafana', icon: 'mdi-chart-box', color: 'primary', url: OBSERVABILITY_URLS.grafana },
  { key: 'prometheus', label: 'Prometheus', icon: 'mdi-fire', color: 'error', url: OBSERVABILITY_URLS.prometheus },
  { key: 'jaeger', label: 'Jaeger', icon: 'mdi-graph-outline', color: 'success', url: OBSERVABILITY_URLS.jaeger },
  { key: 'loki', label: 'Loki', icon: 'mdi-database-eye', color: 'warning', url: OBSERVABILITY_URLS.loki },
]

function open(url: string) {
  window.open(url, '_blank')
}
</script>

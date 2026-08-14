<template>
  <div>
    <PageHeader :title="t('obsTitle')" />

    <v-alert type="info" variant="tonal" class="mb-4">
      {{ t('obsHint') }}
    </v-alert>

    <v-row>
      <v-col v-for="sys in systems" :key="sys.key" cols="12" sm="6" md="3">
        <v-card hover class="text-center pa-4" @click="open(sys.url)">
          <v-icon :icon="sys.icon" size="42" :color="sys.color" class="mb-2" />
          <div class="text-h6">{{ sys.label }}</div>
          <div class="text-caption text-medium-emphasis">{{ sys.url }}</div>
        </v-card>
      </v-col>
    </v-row>
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

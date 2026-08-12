<template>
  <div>
    <PageHeader :title="t('sysTitle')" />

    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>{{ t('appInfo') }}</v-card-title>
          <v-card-text v-if="version">
            <v-list density="compact">
              <v-list-item><v-list-item-title>{{ t('adminConsole') }}</v-list-item-title></v-list-item>
              <v-list-item>{{ t('latestVersion') }}：{{ version.latestVersion }}</v-list-item>
              <v-list-item>{{ t('minVersion') }}：{{ version.minRequiredVersion }}</v-list-item>
              <v-list-item v-if="version.updateUrl">{{ t('updateUrl') }}：<a :href="version.updateUrl" target="_blank">{{ version.updateUrl }}</a></v-list-item>
            </v-list>
            <div class="mt-2">
              <div class="text-subtitle-2 mb-1">{{ t('changelog') }}</div>
              <v-list v-if="version.changelog?.length" density="compact">
                <v-list-item v-for="(c, i) in version.changelog" :key="i">
                  <span class="text-body-2">- {{ c }}</span>
                </v-list-item>
              </v-list>
            </div>
          </v-card-text>
          <v-card-text v-else class="text-medium-emphasis">{{ t('loading') }}</v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>{{ t('runtimeEnv') }}</v-card-title>
          <v-card-text v-if="monitor">
            <v-list density="compact">
              <v-list-item>{{ t('nodeEnv') }}：{{ monitor.health.nodeEnv || '-' }}</v-list-item>
              <v-list-item>{{ t('storageDriverLabel') }}：{{ monitor.dependencies.storage }}</v-list-item>
              <v-list-item>{{ t('pushDriverLabel') }}：{{ monitor.dependencies.push }}</v-list-item>
              <v-list-item>{{ t('mailService') }}：{{ monitor.dependencies.mail }}</v-list-item>
              <v-list-item>{{ t('redisCache') }}：{{ monitor.dependencies.redis }}</v-list-item>
              <v-list-item>{{ t('uptimeLabel') }}：{{ formatUptime(monitor.health.uptimeSec) }}</v-list-item>
            </v-list>
          </v-card-text>
          <v-card-text v-else class="text-medium-emphasis">{{ t('loading') }}</v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import { adminApi } from '@/api/admin'
import { formatUptime } from '@/utils/format'
import type { AppVersionInfo, MonitorSummary } from '@/types/admin'

const { t } = useI18n()
const version = ref<AppVersionInfo | null>(null)
const monitor = ref<MonitorSummary | null>(null)

async function load() {
  try {
    const [v, m] = await Promise.all([adminApi.appVersion(), adminApi.monitorSummary()])
    version.value = v
    monitor.value = m
  } catch {
    // global snackbar
  }
}

onMounted(load)
</script>

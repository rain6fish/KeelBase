<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('sysTitle')" />

    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>{{ t('appInfo') }}</template>
          <div v-if="version" class="d-flex flex-column ga-2">
            <div class="text-body-2 font-weight-medium">{{ t('adminConsole') }}</div>
            <div class="text-body-2">{{ t('latestVersion') }}：{{ version.latestVersion }}</div>
            <div class="text-body-2">{{ t('minVersion') }}：{{ version.minRequiredVersion }}</div>
            <div v-if="version.updateUrl" class="text-body-2">{{ t('updateUrl') }}：<a :href="version.updateUrl" target="_blank">{{ version.updateUrl }}</a></div>
            <div class="mt-2">
              <div class="text-subtitle-2 mb-1">{{ t('changelog') }}</div>
              <div v-if="version.changelog?.length" class="d-flex flex-column ga-1">
                <div v-for="(c, i) in version.changelog" :key="i" class="text-body-2">- {{ c }}</div>
              </div>
            </div>
          </div>
          <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>{{ t('runtimeEnv') }}</template>
          <div v-if="monitor" class="d-flex flex-column ga-2">
            <div class="text-body-2">{{ t('nodeEnv') }}：{{ monitor.health.nodeEnv || '-' }}</div>
            <div class="text-body-2">{{ t('storageDriverLabel') }}：{{ monitor.dependencies.storage }}</div>
            <div class="text-body-2">{{ t('pushDriverLabel') }}：{{ monitor.dependencies.push }}</div>
            <div class="text-body-2">{{ t('mailService') }}：{{ monitor.dependencies.mail }}</div>
            <div class="text-body-2">{{ t('redisCache') }}：{{ monitor.dependencies.redis }}</div>
            <div class="text-body-2">{{ t('uptimeLabel') }}：{{ formatUptime(monitor.health.uptimeSec) }}</div>
          </div>
          <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- FE-1：运行时来源指纹（/app/provenance）—— 「这是什么系统」的运行时自述 -->
    <el-row :gutter="16" class="mt-4">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header>{{ t('provenanceTitle') }}</template>
          <div v-if="provenance" class="d-flex flex-column ga-2">
            <div class="text-body-2">
              {{ t('provenanceSource') }}：
              <template v-if="provenance.source.manifestPresent">
                {{ provenance.source.identity || '-' }}
                <span v-if="provenance.source.generatorVersion"> · {{ provenance.source.generator }} {{ provenance.source.generatorVersion }}</span>
                <span v-if="provenance.source.protocol"> · protocol {{ provenance.source.protocol }}</span>
              </template>
              <span v-else class="text-medium-emphasis">{{ t('provenanceManifestMissing') }}</span>
            </div>
            <div class="text-body-2">{{ t('provenancePreset') }}：{{ provenance.runtime.preset || '-' }}</div>
            <div class="text-body-2">
              {{ t('provenanceModules') }}（{{ provenance.runtime.businessModules.length }}）：
              {{ provenance.runtime.businessModules.map((m) => m.label).join(' / ') || '-' }}
            </div>
            <div class="text-body-2">
              {{ t('provenanceTools') }}：{{ t('provenanceToolsDetail', { total: provenance.runtime.aiToolFingerprint.total, read: provenance.runtime.aiToolFingerprint.read, write: provenance.runtime.aiToolFingerprint.write }) }}
            </div>
          </div>
          <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import { adminApi } from '@/api/admin'
import { provenanceApi, type AppProvenance } from '@/api/provenance'
import { formatUptime } from '@/utils/format'
import type { AppVersionInfo, MonitorSummary } from '@/types/admin'

const { t } = useI18n()
const version = ref<AppVersionInfo | null>(null)
const monitor = ref<MonitorSummary | null>(null)
const provenance = ref<AppProvenance | null>(null)

async function load() {
  try {
    const [v, m] = await Promise.all([adminApi.appVersion(), adminApi.monitorSummary()])
    version.value = v
    monitor.value = m
  } catch {
    // global snackbar
  }
  try {
    provenance.value = await provenanceApi.get()
  } catch {
    // 来源指纹失败不阻断系统页（降级为占位）
  }
}

onMounted(load)
</script>

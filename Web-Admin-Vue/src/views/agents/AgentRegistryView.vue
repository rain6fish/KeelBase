<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navAgents')" :subtitle="t('agentHint')">
      <el-button @click="load()">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <el-card shadow="never">
      <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>
      <div v-else-if="loadError" class="text-error pa-4">{{ loadError }}</div>
      <el-table v-else :data="agents" style="width: 100%">
        <el-table-column prop="id" :label="t('idCol')" width="64" />
        <el-table-column :label="t('agentName')" min-width="160">
          <template #default="{ row }">
            <div class="d-flex align-center ga-1">
              <AppIcon icon="mdi-robot-outline" size="16" />
              <span class="font-weight-medium">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('agentOwner')" width="80">
          <template #default="{ row }">{{ row.ownerId != null ? `#${row.ownerId}` : '-' }}</template>
        </el-table-column>
        <el-table-column prop="purpose" :label="t('agentPurpose')" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.purpose || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('agentCapabilities')" min-width="200">
          <template #default="{ row }">
            <div v-if="parseCapabilities(row.capabilities).length" class="d-flex flex-wrap ga-1">
              <el-tag v-for="cap in parseCapabilities(row.capabilities)" :key="cap" size="small" effect="plain">
                {{ cap }}
              </el-tag>
            </div>
            <span v-else class="text-medium-emphasis">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('agentTrustLevel')" width="150">
          <template #default="{ row }">
            <el-tag :type="trustTag(row.trustLevel).type" size="small" effect="light">
              {{ row.trustLevel }} · {{ trustTag(row.trustLevel).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" :label="t('agentDescription')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('agentCreatedAt')" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('actionCol')" width="200" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="router.push({ path: '/audit', query: { agentId: row.name } })">
              <template #icon><AppIcon icon="mdi-history" /></template>
              {{ t('viewAudit') }}
            </el-button>
            <el-button link type="success" size="small" @click="router.push({ path: '/ai-timeline', query: { agentId: row.name } })">
              <template #icon><AppIcon icon="mdi-timeline-clock-outline" /></template>
              {{ t('viewReplay') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!loading && !loadError && !agents.length" class="text-medium-emphasis pa-4">{{ t('agentEmpty') }}</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { formatTime } from '@/utils/format'
import type { AiAgent } from '@/types/admin'

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const agents = ref<AiAgent[]>([])
const loading = ref(false)
const loadError = ref('')

/** D5 信任级标签：R5 阻断（红）/ R4 人工审批（橙）/ R3 需确认（橙）/ R0-R2 自动（绿） */
function trustTag(level: string) {
  if (level === 'R5') return { label: t('riskBlocked'), type: 'danger' as const }
  if (level === 'R4') return { label: t('riskApproval'), type: 'warning' as const }
  if (level === 'R3') return { label: t('riskConfirm'), type: 'warning' as const }
  return { label: t('riskAuto'), type: 'success' as const }
}

/** capabilities 为 JSON 数组字符串（如 '["read_customer"]'），解析失败回退空数组 */
function parseCapabilities(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr: unknown = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    agents.value = await aiToolsApi.agents()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : t('loadFailed')
    snackbar.error(loadError.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

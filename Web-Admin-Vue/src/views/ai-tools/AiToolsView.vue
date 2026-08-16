<template>
  <div>
    <PageHeader :title="t('navAiTools')" />

    <!-- HS-9 治理策略（写 Settings 实时生效） -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ t('governancePolicy') }}</span>
        <div>
          <v-btn variant="text" prepend-icon="mdi-restore" :disabled="saving" @click="loadAll()">{{ t('resetPolicy') }}</v-btn>
          <v-btn color="primary" prepend-icon="mdi-content-save" :loading="saving" @click="onSavePolicy()">{{ t('savePolicy') }}</v-btn>
        </div>
      </v-card-title>
      <v-card-text>
        <div class="text-caption text-medium-emphasis mb-3">{{ t('policyHint') }}</div>
        <v-radio-group v-model="granularity" inline density="compact" class="mb-2">
          <v-radio :label="t('auditAll')" value="all" />
          <v-radio :label="t('auditWrite')" value="write" />
          <v-radio :label="t('auditOff')" value="off" />
        </v-radio-group>
        <v-table v-if="rows.length" density="compact">
          <thead>
            <tr>
              <th>{{ t('tool') }}</th>
              <th class="text-center">{{ t('enabled') }}</th>
              <th class="text-center">{{ t('requiresConfirmation') }}</th>
              <th>{{ t('allowedRoles') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.name">
              <td>
                <div class="font-weight-medium">{{ row.name }}</div>
                <div class="text-caption text-medium-emphasis">{{ row.description }}</div>
              </td>
              <td class="text-center"><v-switch v-model="row.enabled" density="compact" hide-details color="primary" /></td>
              <td class="text-center"><v-switch v-model="row.requiresConfirmation" density="compact" hide-details color="warning" /></td>
              <td style="max-width: 240px">
                <v-select
                  v-model="row.allowedRoles"
                  :items="roleOptions"
                  multiple
                  clearable
                  :placeholder="t('noRestriction')"
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </td>
            </tr>
          </tbody>
        </v-table>
        <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>{{ t('toolInventory') }}</v-card-title>
      <v-card-text v-if="tools.length">
        <v-row>
          <v-col v-for="tool in tools" :key="tool.name" cols="12" md="6" lg="4">
            <v-card variant="outlined">
              <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
                <v-icon :icon="tool.requiresConfirmation ? 'mdi-shield-check-outline' : 'mdi-wrench-outline'" :color="tool.requiresConfirmation ? 'warning' : 'primary'" size="small" />
                {{ tool.name }}
                <v-chip v-if="tool.requiresConfirmation" size="x-small" color="warning" variant="tonal">{{ t('requiresConfirmation') }}</v-chip>
              </v-card-title>
              <v-card-text class="text-caption">
                <div class="text-medium-emphasis mb-1">{{ tool.description }}</div>
                <div v-if="tool.parameters.length">
                  <span class="font-weight-medium">{{ t('parameters') }}:</span>
                  {{ tool.parameters.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ') }}
                </div>
                <div v-if="tool.permissions?.adminOnly" class="text-error">{{ t('adminOnly') }}</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-text v-else class="text-medium-emphasis">{{ t('loading') }}</v-card-text>
    </v-card>

    <PageHeader :title="t('toolEffects')">
      <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="loadEffects()">{{ t('refresh') }}</v-btn>
    </PageHeader>

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 align-center">
        <v-text-field v-model="effectUserId" :label="t('filterByUserId')" type="number" density="comfortable" variant="outlined" hide-details style="max-width: 180px" />
        <v-btn color="primary" prepend-icon="mdi-filter-variant" @click="loadEffects(1)">{{ t('filter') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="effectHeaders" :items="effects" :loading="effectsLoading" :total="effectTotal" :items-per-page="limit">
      <template #item.resultType="{ item }">
        <StatusChip :status="item.resultType" :label-map="resultTypeMap" />
      </template>
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.targetTitle="{ item }">{{ item.targetTitle || '-' }}</template>
      <template #item.status="{ item }">
        <StatusChip v-if="item.targetExists && !item.targetSoftDeleted" status="ok" :label-map="effectStatusMap" />
        <StatusChip v-else-if="item.targetSoftDeleted" status="cancelled" :label-map="effectStatusMap" />
        <StatusChip v-else status="down" :label-map="effectStatusMap" />
      </template>
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-undo-variant"
          variant="text"
          size="small"
          color="error"
          :disabled="!item.targetExists || item.targetSoftDeleted"
          :title="t('revokeEffect')"
          @click="confirmRevoke(item)"
        />
      </template>
    </AppTable>

    <AppPagination :page="effectPage" :limit="limit" :total="effectTotal" :loading="effectsLoading" @update:page="loadEffects" />

    <ConfirmDialog
      v-model="showRevoke"
      :title="t('revokeEffect')"
      :content="t('revokeEffectConfirm', { title: pending?.targetTitle || `#${pending?.resultId}` })"
      @confirm="onRevoke"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import StatusChip from '@/components/StatusChip.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { buildGovernancePolicy, parseGovernancePolicy } from '@/utils/governance'
import { formatTime } from '@/utils/format'
import type { AdminAiTool, ToolEffect } from '@/types/admin'
import type { AuditGranularity, PolicyToolState } from '@/utils/governance'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const tools = ref<AdminAiTool[]>([])
const effects = ref<ToolEffect[]>([])
const effectTotal = ref(0)
const effectPage = ref(1)
const limit = 20
const effectsLoading = ref(false)
const effectUserId = ref<number | undefined>(undefined)

// HS-9 治理策略编辑状态
const rows = ref<PolicyToolState[]>([])
const granularity = ref<AuditGranularity>('all')
const saving = ref(false)
const roleOptions = computed(() => [
  { title: t('roleUser'), value: 'user' },
  { title: t('roleAdmin'), value: 'admin' },
])

const resultTypeMap = computed(() => ({ event: t('events'), todo: t('todos') }))
const effectStatusMap = computed(() => ({ ok: t('active'), cancelled: t('cancelled'), down: t('deleted') }))

const effectHeaders = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'toolName', title: t('tool') },
  { key: 'resultType', title: t('resultType') },
  { key: 'resultId', title: t('resultId') },
  { key: 'targetTitle', title: t('titleLabel') },
  { key: 'status', title: t('statusCol') },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

/** 加载工具清单 + 治理策略，初始化编辑区（清单返回合并默认后的生效状态）。 */
async function loadAll() {
  try {
    const [toolList, rawPolicy] = await Promise.all([aiToolsApi.tools(), aiToolsApi.policy()])
    tools.value = toolList
    const policy = parseGovernancePolicy(rawPolicy)
    rows.value = toolList.map((tool) => ({
      name: tool.name,
      description: tool.description,
      enabled: tool.enabled,
      requiresConfirmation: tool.requiresConfirmation,
      allowedRoles: tool.allowedRoles ?? [],
    }))
    granularity.value = policy.audit.granularity
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

async function onSavePolicy() {
  saving.value = true
  try {
    const policy = buildGovernancePolicy(rows.value, granularity.value)
    await aiToolsApi.savePolicy(JSON.stringify(policy))
    snackbar.success(t('policySaved'))
    await loadAll()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('policySaveFailed'))
  } finally {
    saving.value = false
  }
}

async function loadEffects(p = 1) {
  effectsLoading.value = true
  try {
    const res = await aiToolsApi.effects(effectUserId.value, p, limit)
    effects.value = res.items
    effectTotal.value = res.total
    effectPage.value = p
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    effectsLoading.value = false
  }
}

const showRevoke = ref(false)
const pending = ref<ToolEffect | null>(null)
function confirmRevoke(item: ToolEffect) {
  pending.value = item
  showRevoke.value = true
}
async function onRevoke() {
  if (!pending.value) return
  try {
    await aiToolsApi.revokeEffect(pending.value.id)
    snackbar.success(t('revoked'))
    loadEffects(effectPage.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('revokeFailed'))
  } finally {
    showRevoke.value = false
  }
}

onMounted(() => {
  loadAll()
  loadEffects()
})
</script>

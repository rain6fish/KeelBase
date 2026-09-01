<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navPolicyCenter')" :subtitle="t('policyCenterHint')">
      <el-button type="primary" :loading="saving" @click="onSavePolicy">
        <template #icon><AppIcon icon="mdi-content-save-outline" /></template>
        {{ t('savePolicy') }}
      </el-button>
    </PageHeader>

    <!-- §22.15 策略模板库：金融/政务/通用三档预设，一键导入实时生效（联动信创「开箱合规」） -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center ga-2">
          <AppIcon icon="mdi-layers-triple-outline" />
          <span>{{ t('policyPresets') }}</span>
        </div>
      </template>
      <el-row v-if="presets.length" :gutter="16">
        <el-col v-for="p in presets" :key="p.id" :xs="24" :md="8">
          <el-card shadow="hover" class="mb-3 preset-card" style="border-color: var(--el-border-color-lighter)">
            <div class="d-flex align-center justify-space-between mb-1">
              <span class="text-subtitle-1 font-weight-medium">{{ t(p.labelKey) }}</span>
              <el-button size="small" type="primary" plain :loading="applying === p.id" @click="onApplyPreset(p.id)">
                {{ t('applyPreset') }}
              </el-button>
            </div>
            <div class="text-caption text-medium-emphasis">{{ t(p.descriptionKey) }}</div>
          </el-card>
        </el-col>
      </el-row>
      <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
    </el-card>

    <el-card shadow="never" class="mb-4">
      <div class="text-caption text-medium-emphasis mb-3">{{ t('policyHint') }}</div>
      <div class="mb-2 d-flex align-center ga-3">
        <span class="text-body-2">{{ t('auditGranularity') }}</span>
        <el-radio-group v-model="granularity">
          <el-radio value="all">{{ t('auditAll') }}</el-radio>
          <el-radio value="write">{{ t('auditWrite') }}</el-radio>
          <el-radio value="off">{{ t('auditOff') }}</el-radio>
        </el-radio-group>
      </div>
      <table v-if="rows.length" class="w-100 border">
        <thead>
          <tr>
            <th class="pa-2 text-left">{{ t('tool') }}</th>
            <th class="text-center pa-2">{{ t('riskLevel') }}</th>
            <th class="text-center pa-2">{{ t('enabled') }}</th>
            <th class="text-center pa-2">{{ t('requiresConfirmation') }}</th>
            <th class="pa-2 text-left">{{ t('allowedRoles') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.name">
            <td class="pa-2">
              <div class="font-weight-medium">{{ row.name }}</div>
              <div class="text-caption text-medium-emphasis">{{ row.description }}</div>
            </td>
            <td class="text-center pa-2">
              <el-tag v-if="toolRisk[row.name]" :type="riskTag(toolRisk[row.name]).type" size="small" effect="light">
                {{ toolRisk[row.name].riskLevel }} · {{ riskTag(toolRisk[row.name]).label }}
              </el-tag>
            </td>
            <td class="text-center pa-2"><el-switch v-model="row.enabled" /></td>
            <td class="text-center pa-2"><el-switch v-model="row.requiresConfirmation" style="--el-switch-on-color: var(--el-color-warning)" /></td>
            <td class="pa-2" style="max-width: 240px">
              <el-select v-model="row.allowedRoles" multiple clearable :placeholder="t('noRestriction')">
                <el-option v-for="o in roleOptions" :key="o.value" :label="o.title" :value="o.value" />
              </el-select>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { buildGovernancePolicy, parseGovernancePolicy } from '@/utils/governance'
import type { AdminAiTool } from '@/types/admin'
import type { AuditGranularity, PolicyToolState } from '@/utils/governance'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const tools = ref<AdminAiTool[]>([])
const rows = ref<PolicyToolState[]>([])
const granularity = ref<AuditGranularity>('all')
const saving = ref(false)
const presets = ref<Array<{ id: string; labelKey: string; descriptionKey: string }>>([])
const applying = ref('')
const roleOptions = computed(() => [
  { title: t('roleUser'), value: 'user' },
  { title: t('roleAdmin'), value: 'admin' },
])

/** W5 风险级标签：R5 阻断（红）/ R4 人工审批（橙）/ R3 需确认（橙）/ R0-R2 自动（绿） */
function riskTag(tool: AdminAiTool) {
  const lv = tool.riskLevel || ''
  if (lv === 'R5') return { label: t('riskBlocked'), type: 'danger' as const }
  if (lv === 'R4') return { label: t('riskApproval'), type: 'warning' as const }
  if (lv === 'R3') return { label: t('riskConfirm'), type: 'warning' as const }
  return { label: t('riskAuto'), type: 'success' as const }
}

const toolRisk = computed(() => {
  const m: Record<string, AdminAiTool> = {}
  for (const t of tools.value) m[t.name] = t
  return m
})

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

async function onApplyPreset(id: string) {
  applying.value = id
  try {
    await aiToolsApi.applyPolicyPreset(id)
    snackbar.success(t('presetApplied'))
    await loadAll()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('presetApplyFailed'))
  } finally {
    applying.value = ''
  }
}

onMounted(async () => {
  loadAll()
  try {
    presets.value = await aiToolsApi.policyPresets()
  } catch {
    presets.value = []
  }
})
</script>

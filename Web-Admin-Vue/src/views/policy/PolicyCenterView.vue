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

    <!-- §22.15(4) 治理策略可视化编辑：门控档位（auto/confirm/approval）+ 工具开关 + 角色白名单 -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center justify-space-between">
          <div class="d-flex align-center ga-2">
            <AppIcon icon="mdi-shield-edit-outline" />
            <span>{{ t('governancePolicy') }}</span>
            <el-tag v-if="overrideCount > 0" size="small" type="warning" effect="plain">
              {{ t('overridesCount', { count: overrideCount }) }}
            </el-tag>
          </div>
          <el-button text size="small" :disabled="overrideCount === 0" @click="resetAllToDefault">
            <template #icon><AppIcon icon="mdi-backup-restore" /></template>
            {{ t('resetToDefault') }}
          </el-button>
        </div>
      </template>

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
            <th class="text-center pa-2">{{ t('gateModeColumn') }}</th>
            <th class="text-center pa-2">{{ t('enabled') }}</th>
            <th class="pa-2 text-left">{{ t('allowedRoles') }}</th>
            <th class="pa-2 text-right" style="width: 110px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.name">
            <td class="pa-2">
              <div class="d-flex align-center ga-2">
                <span class="font-weight-medium">{{ row.name }}</span>
                <el-tag v-if="row.overridden" size="small" type="warning" effect="plain">{{ t('overrideBadge') }}</el-tag>
              </div>
              <div class="text-caption text-medium-emphasis">{{ row.description }}</div>
            </td>
            <td class="text-center pa-2">
              <el-tooltip v-if="row.gate === 'blocked'" :content="t('blockedNote')" placement="top">
                <el-tag type="danger" size="small" effect="light">{{ row.riskLevel }} · {{ t('riskBlocked') }}</el-tag>
              </el-tooltip>
              <el-tag v-else :type="riskTag(row).type" size="small" effect="light">
                {{ row.riskLevel }} · {{ riskTag(row).label }}
              </el-tag>
            </td>
            <td class="text-center pa-2">
              <template v-if="row.gate === 'blocked'">
                <el-tag type="danger" size="small" effect="plain" disable-transitions>{{ t('riskBlocked') }}</el-tag>
              </template>
              <el-radio-group v-else v-model="row.gate" size="small">
                <el-radio value="auto">{{ t('gateAuto') }}</el-radio>
                <el-radio value="confirm">{{ t('gateConfirm') }}</el-radio>
                <el-radio value="approval" style="--el-radio-checked-color: var(--el-color-warning)">{{ t('gateApproval') }}</el-radio>
              </el-radio-group>
            </td>
            <td class="text-center pa-2">
              <el-switch v-model="row.enabled" :disabled="row.gate === 'blocked'" />
            </td>
            <td class="pa-2" style="max-width: 220px">
              <el-select v-model="row.allowedRoles" multiple clearable :disabled="row.gate === 'blocked'" :placeholder="t('noRestriction')" size="small">
                <el-option v-for="o in roleOptions" :key="o.value" :label="o.title" :value="o.value" />
              </el-select>
            </td>
            <td class="pa-2 text-right">
              <el-button
                v-if="row.gate !== 'blocked' && rowOverridden(row)"
                text
                size="small"
                :title="t('resetToDefault')"
                @click="revertRow(row)"
              >
                <template #icon><AppIcon icon="mdi-backup-restore" /></template>
              </el-button>
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
import {
  buildGovernancePolicy,
  declaredGateMode,
  effectiveGate,
  parseGovernancePolicy,
} from '@/utils/governance'
import type { AdminAiTool } from '@/types/admin'
import type { AuditGranularity, PolicyToolOverride, PolicyToolState } from '@/utils/governance'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const rows = ref<PolicyToolState[]>([])
const granularity = ref<AuditGranularity>('all')
const saving = ref(false)
const presets = ref<Array<{ id: string; labelKey: string; descriptionKey: string }>>([])
const applying = ref('')
const rawOverrides = ref<Record<string, PolicyToolOverride>>({})

const roleOptions = computed(() => [
  { title: t('roleUser'), value: 'user' },
  { title: t('roleAdmin'), value: 'admin' },
])
const overrideCount = computed(() => Object.keys(rawOverrides.value).length)

/** W5 风险级标签：R5 阻断（红）/ R4 人工审批（橙）/ R3 需确认（橙）/ R0-R2 自动（绿） */
function riskTag(row: { riskLevel: string }) {
  if (row.riskLevel === 'R5') return { label: t('riskBlocked'), type: 'danger' as const }
  if (row.riskLevel === 'R4') return { label: t('riskApproval'), type: 'warning' as const }
  if (row.riskLevel === 'R3') return { label: t('riskConfirm'), type: 'warning' as const }
  return { label: t('riskAuto'), type: 'success' as const }
}

/** 行是否有策略覆盖（区别于行内生效值 == 声明值） */
function rowOverridden(row: PolicyToolState): boolean {
  if (row.enabled === false) return true
  if (row.allowedRoles.length > 0) return true
  if (row.gate !== 'blocked' && row.gate !== row.declaredGate) return true
  return false
}

function initRows(toolList: AdminAiTool[], overrides: Record<string, PolicyToolOverride>): PolicyToolState[] {
  return toolList.map((tool) => {
    const riskLevel = tool.riskLevel || 'R1'
    return {
      name: tool.name,
      description: tool.description,
      riskLevel,
      enabled: tool.enabled,
      allowedRoles: tool.allowedRoles ?? [],
      gate: effectiveGate(tool),
      declaredGate: declaredGateMode(riskLevel),
      overridden: Object.keys(overrides[tool.name] ?? {}).length > 0,
    }
  })
}

/** 加载工具清单 + 治理策略，初始化编辑区（清单返回后端合并默认后的生效档位）。 */
async function loadAll() {
  try {
    const [toolList, rawPolicy] = await Promise.all([aiToolsApi.tools(), aiToolsApi.policy()])
    const policy = parseGovernancePolicy(rawPolicy)
    rawOverrides.value = policy.tools
    rows.value = initRows(toolList, policy.tools)
    granularity.value = policy.audit.granularity
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

/** §22.15(4) 差异保存：只写与默认不同的覆盖项，实时生效。 */
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

/** 单行恢复默认：重置为声明档位 + 默认启用/无角色（保存时 diff 自动清除该行覆盖）。 */
function revertRow(row: PolicyToolState) {
  row.enabled = true
  row.allowedRoles = []
  row.gate = row.declaredGate === 'blocked' ? 'auto' : row.declaredGate
}

function resetAllToDefault() {
  for (const r of rows.value) revertRow(r)
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

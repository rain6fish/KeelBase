<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- §22.15 (4) 首次信任配置向导：确认规则 / 平台规模 / 审计粒度三步；可跳过、可重入、只在最后显式保存。 -->
<!-- §22.15 (4) first-run trust setup: confirmation rules / platform scale / audit granularity in three steps;
     skippable, re-enterable, and nothing is written until the final explicit save. -->
<template>
  <el-dialog
    v-model="store.visible"
    :title="t('trustSetupTitle')"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :before-close="onBeforeClose"
    width="720px"
  >
    <div v-loading="loading">
      <p class="text-body-2 text-medium-emphasis mb-3">{{ t('trustSetupDesc') }}</p>

      <el-steps :active="step" finish-status="success" simple class="mb-4">
        <el-step :title="t('trustSetupStepRules')" />
        <el-step :title="t('trustSetupStepScale')" />
        <el-step :title="t('trustSetupStepAudit')" />
      </el-steps>

      <el-alert v-if="loadError" type="error" :closable="false" show-icon class="mb-3">
        <template #title>{{ t('trustSetupLoadFailed') }}</template>
        <el-button size="small" text type="primary" @click="load">{{ t('trustSetupRetry') }}</el-button>
      </el-alert>

      <!-- Step 1: confirmation rules (R3/R4 gate modes) -->
      <div v-else-if="step === 0">
        <el-alert type="info" :closable="false" show-icon class="mb-3" :title="t('trustSetupRulesHint')" />
        <div v-for="g in groups" :key="g.level" class="mb-4" :data-rule-group="g.level">
          <div class="text-subtitle-1 mb-1">{{ t('trustSetupRuleGroup', { level: g.level, mode: gateLabel(g.declared) }) }}</div>
          <div v-if="g.tools.length" class="text-body-2 text-medium-emphasis mb-2">
            {{ t('trustSetupRuleCurrent', { total: g.tools.length, auto: g.counts.auto, confirm: g.counts.confirm, approval: g.counts.approval }) }}
          </div>
          <div v-else class="text-medium-emphasis mb-2">{{ t('trustSetupNoTools') }}</div>
          <el-radio-group v-model="g.proposal" :disabled="g.tools.length === 0">
            <el-radio value="keep">{{ t('trustSetupKeep') }}</el-radio>
            <el-radio value="auto">{{ t('gateAuto') }}</el-radio>
            <el-radio value="confirm">{{ t('gateConfirm') }}</el-radio>
            <el-radio value="approval">{{ t('gateApproval') }}</el-radio>
          </el-radio-group>
          <div class="text-caption text-medium-emphasis mt-1">{{ t(modeImpact(g.proposal)) }}</div>
        </div>
      </div>

      <!-- Step 2: platform scale (reuses POST /settings/preset) -->
      <div v-else-if="step === 1">
        <div class="text-body-2 mb-2">
          {{ t('trustSetupPresetCurrent', { preset: currentPreset ? presetLabel(currentPreset) : t('trustSetupPresetUnset') }) }}
        </div>
        <div class="text-caption text-medium-emphasis mb-3">{{ t('trustSetupPresetHint') }}</div>
        <div class="preset-grid">
          <div class="preset-card" :class="{ active: preset === 'keep' }" @click="preset = 'keep'">
            <h4>{{ t('trustSetupKeep') }}</h4>
            <p>{{ t('trustSetupPresetKeepImpact') }}</p>
          </div>
          <div
            v-for="p in presetOptions"
            :key="p.key"
            class="preset-card"
            :class="{ active: preset === p.key }"
            @click="preset = p.key"
          >
            <h4>{{ t(`presetCard${cap(p.key)}Title`) }}</h4>
            <p>{{ t(`presetCard${cap(p.key)}Desc`) }}</p>
            <ul>
              <li v-for="f in p.features" :key="f">{{ t(f) }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Step 3: audit granularity + summary -->
      <div v-else>
        <div class="text-body-2 mb-2">{{ t('trustSetupAuditCurrent', { mode: auditLabel(currentGranularity) }) }}</div>
        <div class="text-caption text-medium-emphasis mb-2">{{ t('trustSetupAuditHint') }}</div>
        <el-radio-group v-model="granularity">
          <el-radio value="all">{{ t('auditAll') }}</el-radio>
          <el-radio value="write">{{ t('auditWrite') }}</el-radio>
          <el-radio value="off">{{ t('auditOff') }}</el-radio>
        </el-radio-group>
        <div class="text-caption text-medium-emphasis mt-1">{{ t(auditImpact(granularity)) }}</div>

        <el-divider />
        <div class="text-subtitle-2 mb-1">{{ t('trustSetupSummary') }}</div>
        <ul v-if="anyChange" class="summary-list">
          <li v-for="line in summaryLines" :key="line">{{ line }}</li>
        </ul>
        <div v-else class="text-medium-emphasis">{{ t('trustSetupNoChanges') }}</div>
        <div v-if="anyChange" class="text-caption text-medium-emphasis mt-2">{{ t('trustSetupAppliedNote') }}</div>
      </div>
    </div>

    <template #footer>
      <div class="d-flex align-center justify-space-between">
        <el-button text :disabled="saving" @click="skip">{{ t('trustSetupSkip') }}</el-button>
        <div class="d-flex ga-2">
          <el-button v-if="step > 0" :disabled="saving" @click="step--">{{ t('trustSetupBack') }}</el-button>
          <el-button v-if="step < 2" type="primary" :disabled="loading || loadError" @click="step++">{{ t('trustSetupNext') }}</el-button>
          <el-button v-else type="primary" :loading="saving" :disabled="loading || loadError" @click="save">
            {{ anyChange ? t('trustSetupSave') : t('trustSetupFinish') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useSnackbarStore } from '@/stores/snackbar'
import { useTrustSetupStore } from '@/stores/trustSetup'
import { settingsApi } from '@/api/settings'
import { aiToolsApi } from '@/api/aiTools'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'
import {
  declaredGateMode,
  effectiveGate,
  parseGovernancePolicy,
} from '@/utils/governance'
import type {
  AuditGranularity,
  GovernancePolicyShape,
  PolicyToolOverride,
  ToolGateMode,
} from '@/utils/governance'
import type { AdminAiTool } from '@/types/admin'

const { t } = useI18n()
const auth = useAuthStore()
const snackbar = useSnackbarStore()
const store = useTrustSetupStore()

type PresetKey = 'full' | 'small' | 'lite'
type PresetProposal = 'keep' | PresetKey
type RuleProposal = 'keep' | ToolGateMode

interface RuleGroup {
  level: 'R3' | 'R4'
  tools: AdminAiTool[]
  /** Declared gate for this risk level (confirm for R3, approval for R4). / 该风险级的声明档位。 */
  declared: ToolGateMode
  counts: Record<ToolGateMode, number>
  proposal: RuleProposal
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const presetOptions: Array<{ key: PresetKey; features: string[] }> = [
  { key: 'full', features: ['presetFAll'] },
  { key: 'small', features: ['presetFSmall'] },
  { key: 'lite', features: ['presetFLite'] },
]

const step = ref(0)
const loading = ref(false)
const loadError = ref(false)
const saving = ref(false)

const groups = ref<RuleGroup[]>([emptyGroup('R3'), emptyGroup('R4')])
const currentPolicy = ref<GovernancePolicyShape>({ tools: {}, audit: { granularity: 'all' } })
const currentGranularity = ref<AuditGranularity>('all')
const currentPreset = ref<string | null>(null)
const granularity = ref<AuditGranularity>('all')
const preset = ref<PresetProposal>('full')
let autoChecked = false

function emptyGroup(level: 'R3' | 'R4'): RuleGroup {
  return {
    level,
    tools: [],
    declared: declaredGateMode(level) as ToolGateMode,
    counts: { auto: 0, confirm: 0, approval: 0 },
    proposal: 'keep',
  }
}

function buildGroup(level: 'R3' | 'R4', tools: AdminAiTool[]): RuleGroup {
  const groupTools = tools.filter((tool) => tool.riskLevel === level)
  const counts: Record<ToolGateMode, number> = { auto: 0, confirm: 0, approval: 0 }
  for (const tool of groupTools) {
    const gate = effectiveGate(tool)
    if (gate !== 'blocked') counts[gate] += 1
  }
  return { ...emptyGroup(level), tools: groupTools, counts }
}

/** Load the current policy / tool inventory / settings — read-only until the final save. */
// 读取当前策略 / 工具清单 / 设置 —— 在最后保存前只读。
async function load() {
  loading.value = true
  loadError.value = false
  step.value = 0
  try {
    const [toolList, rawPolicy, rows] = await Promise.all([
      aiToolsApi.tools(),
      aiToolsApi.policy(),
      settingsApi.list(),
    ])
    const policy = parseGovernancePolicy(rawPolicy)
    currentPolicy.value = policy
    currentGranularity.value = policy.audit.granularity
    granularity.value = policy.audit.granularity
    currentPreset.value = rows.find((r) => r.key === 'feature_flags_selected')?.value ?? null
    preset.value = isPresetKey(currentPreset.value) ? currentPreset.value : 'full'
    groups.value = [buildGroup('R3', toolList), buildGroup('R4', toolList)]
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function isPresetKey(value: string | null): value is PresetKey {
  return value === 'full' || value === 'small' || value === 'lite'
}

function gateLabel(mode: ToolGateMode): string {
  return t(mode === 'auto' ? 'gateAuto' : mode === 'confirm' ? 'gateConfirm' : 'gateApproval')
}

function auditLabel(mode: AuditGranularity): string {
  return t(mode === 'all' ? 'auditAll' : mode === 'write' ? 'auditWrite' : 'auditOff')
}

function presetLabel(key: string): string {
  return isPresetKey(key) ? t(`presetCard${cap(key)}Title`) : key
}

function modeImpact(proposal: RuleProposal): string {
  if (proposal === 'keep') return 'trustSetupImpactKeep'
  if (proposal === 'auto') return 'trustSetupImpactAuto'
  if (proposal === 'confirm') return 'trustSetupImpactConfirm'
  return 'trustSetupImpactApproval'
}

function auditImpact(mode: AuditGranularity): string {
  return mode === 'all'
    ? 'trustSetupAuditAllImpact'
    : mode === 'write'
      ? 'trustSetupAuditWriteImpact'
      : 'trustSetupAuditOffImpact'
}

/** A group changes only when the chosen mode differs from at least one tool's effective gate. */
// 只有所选档位与至少一个工具的生效档位不同，该组才算有变更。
function groupChanged(group: RuleGroup): boolean {
  if (group.proposal === 'keep') return false
  return group.tools.some((tool) => effectiveGate(tool) !== group.proposal)
}

const ruleChanges = computed(() => groups.value.filter(groupChanged))
const auditChanged = computed(() => granularity.value !== currentGranularity.value)
const presetChanged = computed(() => preset.value !== 'keep' && preset.value !== currentPreset.value)
const anyChange = computed(() => ruleChanges.value.length > 0 || auditChanged.value || presetChanged.value)

const summaryLines = computed(() => {
  const lines: string[] = []
  for (const group of ruleChanges.value) {
    lines.push(t('trustSetupDiffRules', { level: group.level, mode: gateLabel(group.proposal as ToolGateMode) }))
  }
  if (auditChanged.value) {
    lines.push(t('trustSetupDiffAudit', { from: auditLabel(currentGranularity.value), to: auditLabel(granularity.value) }))
  }
  if (presetChanged.value && preset.value !== 'keep') {
    lines.push(t('trustSetupDiffPreset', { preset: presetLabel(preset.value) }))
  }
  return lines
})

/**
 * Build the next policy from the current overrides, preserving every dimension the wizard does not
 * own (enabled / allowedRoles / writableFields / allowedDestinations / boundedFields).
 * 在当前覆盖上构建下一版策略；向导不负责的维度（启用 / 角色白名单 / 可写字段域等）原样保留。
 */
function buildNextPolicy(): GovernancePolicyShape {
  const tools: Record<string, PolicyToolOverride> = JSON.parse(
    JSON.stringify(currentPolicy.value.tools),
  ) as Record<string, PolicyToolOverride>
  for (const group of groups.value) {
    if (group.proposal === 'keep') continue
    for (const tool of group.tools) {
      const entry: PolicyToolOverride = { ...(tools[tool.name] ?? {}) }
      // Restoring the declared gate means removing both the explicit mode and the legacy boolean.
      // 恢复声明档位时，显式 mode 与 legacy 布尔都要移除，否则旧字段还会继续生效。
      if (group.proposal === group.declared) {
        delete entry.mode
        delete entry.requiresConfirmation
      } else {
        entry.mode = group.proposal
        delete entry.requiresConfirmation
      }
      if (Object.keys(entry).length > 0) tools[tool.name] = entry
      else delete tools[tool.name]
    }
  }
  return { tools, audit: { granularity: granularity.value } }
}

async function save() {
  if (!anyChange.value) {
    finish()
    return
  }
  saving.value = true
  try {
    // Policy first (confirmation rules + audit granularity share one document).
    // 先写策略（确认规则与审计粒度在同一份文档里）。
    if (ruleChanges.value.length > 0 || auditChanged.value) {
      await aiToolsApi.savePolicy(JSON.stringify(buildNextPolicy()))
    }
    const presetToApply = preset.value
    if (presetChanged.value && presetToApply !== 'keep') {
      await settingsApi.applyPreset(presetToApply)
    }
    snackbar.success(t('trustSetupSaved'))
    finish()
    // Feature flags shape navigation; reload so the shell reflects the new scale.
    // 特性开关影响导航，重新加载让外壳反映新规模。
    if (presetChanged.value) window.location.reload()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('trustSetupSaveFailed'))
  } finally {
    saving.value = false
  }
}

/** Mark the wizard as seen and close — used by both "Skip" and the dialog's X. */
// 标记已看过并关闭 —— 「跳过」与弹窗右上角 X 共用。
function skip() {
  storage.set(STORAGE_KEYS.TRUST_SETUP_DONE, '1')
  store.close()
}

function finish() {
  storage.set(STORAGE_KEYS.TRUST_SETUP_DONE, '1')
  store.close()
}

function onBeforeClose(done: () => void) {
  skip()
  done()
}

/** First-run auto-open: admin only, once per browser, and only while no preset has been selected. */
// 首启自动打开：仅管理员、每浏览器一次，且服务端尚未记录任何 preset 选择。
async function maybeAutoOpen() {
  if (!auth.isAdmin || autoChecked) return
  autoChecked = true
  if (storage.get(STORAGE_KEYS.TRUST_SETUP_DONE)) return
  try {
    const rows = await settingsApi.list()
    if (!rows.some((r) => r.key === 'feature_flags_selected')) store.open()
  } catch {
    // GET /settings is admin-only; non-admin or failure stays silent.
    // GET /settings 仅管理员；非管理员或失败保持静默。
  }
}

watch(() => auth.isAdmin, (value) => { if (value) void maybeAutoOpen() }, { immediate: true })
watch(() => store.visible, (value) => { if (value) void load() })
</script>

<style scoped>
.preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.preset-card {
  border: 1px solid var(--el-border-color); border-radius: 10px; padding: 12px; cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.preset-card.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary); }
.preset-card h4 { margin: 0 0 6px; }
.preset-card p { font-size: 12px; color: var(--el-text-color-secondary); margin: 0 0 6px; }
.preset-card ul { margin: 0; padding-left: 16px; font-size: 12px; color: var(--el-text-color-regular); }
.summary-list { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.8; }
</style>

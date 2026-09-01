<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navAiTools')" />

    <!-- HS-9 治理策略（写 Settings 实时生效） -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center justify-space-between">
          <span>{{ t('governancePolicy') }}</span>
          <div>
            <el-button text :disabled="saving" @click="loadAll()">
              <template #icon><AppIcon icon="mdi-restore" /></template>
              {{ t('resetPolicy') }}
            </el-button>
            <el-button type="primary" :loading="saving" @click="onSavePolicy()">
              <template #icon><AppIcon icon="mdi-content-save" /></template>
              {{ t('savePolicy') }}
            </el-button>
          </div>
        </div>
      </template>
      <div class="text-caption text-medium-emphasis mb-3">{{ t('policyHint') }}</div>
      <el-radio-group v-model="granularity" class="mb-2">
        <el-radio value="all">{{ t('auditAll') }}</el-radio>
        <el-radio value="write">{{ t('auditWrite') }}</el-radio>
        <el-radio value="off">{{ t('auditOff') }}</el-radio>
      </el-radio-group>
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

    <!-- N-6 AI-23 内容安全配置（Settings ai_content_safety，实时生效） -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center justify-space-between">
          <span>{{ t('contentSafetyTitle') }}</span>
          <div>
            <el-button text :disabled="savingSafety" @click="loadContentSafety()">
              <template #icon><AppIcon icon="mdi-restore" /></template>
              {{ t('resetPolicy') }}
            </el-button>
            <el-button type="primary" :loading="savingSafety" @click="onSaveContentSafety()">
              <template #icon><AppIcon icon="mdi-content-save" /></template>
              {{ t('savePolicy') }}
            </el-button>
          </div>
        </div>
      </template>
      <div class="d-flex align-center ga-2 mb-3">
        <el-switch v-model="contentSafety.enabled" />
        <span class="text-caption text-medium-emphasis">{{ t('contentSafetyHint') }}</span>
      </div>
      <div class="mb-3">
        <div class="text-caption font-weight-medium mb-1">{{ t('contentSensitiveWords') }}</div>
        <el-input v-model="contentSafety.sensitiveText" type="textarea" :rows="4" :placeholder="t('contentWordsPlaceholder')" />
      </div>
      <div>
        <div class="text-caption font-weight-medium mb-1">{{ t('contentJailbreakWords') }}</div>
        <el-input v-model="contentSafety.jailbreakText" type="textarea" :rows="3" :placeholder="t('contentWordsPlaceholder')" />
      </div>
    </el-card>

    <el-card shadow="never" class="mb-4">
      <template #header>{{ t('toolInventory') }}</template>
      <div v-if="tools.length">
        <el-row :gutter="16">
          <el-col v-for="tool in tools" :key="tool.name" :xs="24" :md="12" :lg="8">
            <el-card shadow="never" class="mb-4">
              <template #header>
                <div class="text-subtitle-1 d-flex align-center ga-2">
                  <AppIcon
                    :icon="tool.requiresConfirmation ? 'mdi-shield-check-outline' : 'mdi-wrench-outline'"
                    :color="tool.requiresConfirmation ? 'var(--el-color-warning)' : 'var(--el-color-primary)'"
                    size="18"
                  />
                  {{ tool.name }}
                  <el-tag v-if="tool.requiresConfirmation" size="small" type="warning" effect="light">{{ t('requiresConfirmation') }}</el-tag>
                  <el-tag v-if="tool.riskLevel" size="small" :type="riskTag(tool).type" effect="light">{{ tool.riskLevel }} · {{ riskTag(tool).label }}</el-tag>
                </div>
              </template>
              <div class="text-caption">
                <div class="text-medium-emphasis mb-1">{{ tool.description }}</div>
                <div v-if="tool.parameters.length">
                  <span class="font-weight-medium">{{ t('parameters') }}:</span>
                  {{ tool.parameters.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ') }}
                </div>
                <div v-if="tool.permissions?.adminOnly" class="text-error">{{ t('adminOnly') }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
      <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
    </el-card>

    <PageHeader :title="t('toolEffects')">
      <el-button @click="loadEffects()">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 align-center">
        <el-input v-model="effectUserId" :label="t('filterByUserId')" type="number" style="max-width: 180px" />
        <el-button type="primary" @click="loadEffects(1)">
          <template #icon><AppIcon icon="mdi-filter-variant" /></template>
          {{ t('filter') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="effectHeaders" :items="effects" :loading="effectsLoading" :total="effectTotal" :items-per-page="limit">
      <template #item.resultType="{ item }">
        <StatusChip :status="item.resultType" :label-map="resultTypeMap" />
      </template>
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.targetTitle="{ item }">{{ item.targetTitle || '-' }}</template>
      <template #item.fieldDiff="{ item }">
        <el-button v-if="item.afterSnapshot" text size="small" type="primary" @click="showDiff(item)">
          {{ diffCount(item) }} {{ t('diffFields') }}
        </el-button>
        <span v-else class="text-medium-emphasis">—</span>
      </template>
      <template #item.status="{ item }">
        <StatusChip v-if="item.targetExists && !item.targetSoftDeleted" status="ok" :label-map="effectStatusMap" />
        <StatusChip v-else-if="item.targetSoftDeleted" status="cancelled" :label-map="effectStatusMap" />
        <StatusChip v-else status="down" :label-map="effectStatusMap" />
      </template>
      <template #item.actions="{ item }">
        <el-button
          text
          size="small"
          type="danger"
          :disabled="!item.targetExists || item.targetSoftDeleted"
          :title="t('revokeEffect')"
          @click="confirmRevoke(item)"
        >
          <AppIcon icon="mdi-undo-variant" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination :page="effectPage" :limit="limit" :total="effectTotal" :loading="effectsLoading" @update:page="loadEffects" />

    <ConfirmDialog
      v-model="showRevoke"
      :title="t('revokeEffect')"
      :content="t('revokeEffectConfirm', { title: pending?.targetTitle || `#${pending?.resultId}` })"
      @confirm="onRevoke"
    />

    <!-- E-1 字段级变更审计：副作用目标记录 before/after diff -->
    <el-dialog v-model="showDiffDialog" :title="t('fieldChange')" width="600px">
      <FieldDiff v-if="diffTarget" :before="diffTarget.beforeSnapshot" :after="diffTarget.afterSnapshot" />
    </el-dialog>
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
import FieldDiff from '@/components/FieldDiff.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { settingsApi } from '@/api/settings'
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
// E-1 字段级变更审计：查看目标记录 before/after diff
const diffTarget = ref<ToolEffect | null>(null)
const showDiffDialog = ref(false)

// HS-9 治理策略编辑状态
const rows = ref<PolicyToolState[]>([])
const granularity = ref<AuditGranularity>('all')
const saving = ref(false)
// N-6 内容安全配置编辑状态（textarea 用文本，保存时 split）
const contentSafety = ref<{ enabled: boolean; sensitiveText: string; jailbreakText: string }>({ enabled: true, sensitiveText: '', jailbreakText: '' })
const savingSafety = ref(false)
const roleOptions = computed(() => [
  { title: t('roleUser'), value: 'user' },
  { title: t('roleAdmin'), value: 'admin' },
])

const resultTypeMap = computed(() => ({ event: t('events'), todo: t('todos') }))
const effectStatusMap = computed(() => ({ ok: t('active'), cancelled: t('cancelled'), down: t('deleted') }))

/** E-1：副作用目标记录字段变更数（无快照 0；非法 JSON 0） */
function diffCount(item: ToolEffect): number {
  if (!item.afterSnapshot) return 0
  try {
    const after = JSON.parse(item.afterSnapshot) as Record<string, unknown>
    if (!item.beforeSnapshot) return Object.keys(after).length
    const before = JSON.parse(item.beforeSnapshot) as Record<string, unknown>
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).length
  } catch {
    return 0
  }
}

function showDiff(item: ToolEffect) {
  diffTarget.value = item
  showDiffDialog.value = true
}

/** W5 风险级标签：R5 阻断（红）/ R4 人工审批（橙）/ R3 需确认（橙）/ R0-R2 自动（绿） */
function riskTag(tool: AdminAiTool) {
  const lv = tool.riskLevel || ''
  if (lv === 'R5') return { label: t('riskBlocked'), type: 'danger' as const }
  if (lv === 'R4') return { label: t('riskApproval'), type: 'warning' as const }
  if (lv === 'R3') return { label: t('riskConfirm'), type: 'warning' as const }
  return { label: t('riskAuto'), type: 'success' as const }
}
/** 工具名 → 风险级（治理表只读列用） */
const toolRisk = computed(() => {
  const m: Record<string, AdminAiTool> = {}
  for (const t of tools.value) m[t.name] = t
  return m
})

const effectHeaders = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'toolName', title: t('tool') },
  { key: 'resultType', title: t('resultType') },
  { key: 'resultId', title: t('resultId') },
  { key: 'targetTitle', title: t('titleLabel') },
  { key: 'fieldDiff', title: t('fieldChange') },
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

/** N-6 加载内容安全配置（Settings ai_content_safety） */
async function loadContentSafety() {
  try {
    const rows = await settingsApi.list()
    const row = rows.find((r) => r.key === 'ai_content_safety')
    if (row) {
      const parsed = JSON.parse(row.value || '{}') as { enabled?: boolean; sensitive?: string[]; jailbreak?: string[] }
      contentSafety.value = {
        enabled: parsed.enabled !== false,
        sensitiveText: Array.isArray(parsed.sensitive) ? parsed.sensitive.join('\n') : '',
        jailbreakText: Array.isArray(parsed.jailbreak) ? parsed.jailbreak.join('\n') : '',
      }
    } else {
      contentSafety.value = { enabled: true, sensitiveText: '', jailbreakText: '' }
    }
  } catch {
    // 缺省不填（默认表由后端兜底）
  }
}

/** N-6 保存内容安全配置（换行/逗号分隔 → JSON → PUT 实时生效） */
async function onSaveContentSafety() {
  savingSafety.value = true
  try {
    const split = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean)
    await settingsApi.update(
      'ai_content_safety',
      JSON.stringify({
        enabled: contentSafety.value.enabled,
        sensitive: split(contentSafety.value.sensitiveText),
        jailbreak: split(contentSafety.value.jailbreakText),
      }),
    )
    snackbar.success(t('policySaved'))
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    savingSafety.value = false
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
  loadContentSafety()
})
</script>

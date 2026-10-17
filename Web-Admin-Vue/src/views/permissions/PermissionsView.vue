<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="permissions-view" data-testid="permissions-boundary">
    <PageHeader :title="t('navPermissions')" :subtitle="t('boundarySubtitle')">
      <el-button size="small" data-testid="permission-refresh" @click="reload">
        {{ t('permissionRefresh') }}
      </el-button>
    </PageHeader>

    <!-- Q1 who: identity + authorization basis, both read from the server chain. -->
    <!-- Q1 谁：身份 + 授权依据，二者均读自服务端授权链。 -->
    <el-card shadow="never" class="mb-4" data-testid="boundary-who">
      <template #header>
        <div class="flex items-center gap-2">
          <AppIcon icon="mdi-account-shield-outline" />
          <span>{{ t('boundaryWho') }}</span>
        </div>
      </template>

      <div v-if="auth.isAdmin" class="d-flex flex-wrap align-center ga-3 mb-3">
        <span class="text-caption text-medium-emphasis">{{ t('boundaryViewAs') }}</span>
        <el-select
          v-model="targetUserId"
          clearable
          filterable
          :placeholder="t('boundaryViewSelf')"
          style="width: 240px"
          data-testid="boundary-target"
          @change="reload"
        >
          <el-option v-for="u in userOptions" :key="u.id" :label="`${u.username} (#${u.id})`" :value="u.id" />
        </el-select>
      </div>

      <div v-if="chain" class="d-flex flex-wrap align-center ga-6">
        <div>
          <div class="text-caption text-medium-emphasis">{{ t('authChainGrantee') }}</div>
          <div class="d-flex align-center ga-2">
            <span class="font-weight-medium" data-testid="permission-role">{{ chain.user.username ?? '-' }}</span>
            <el-tag :type="chain.user.role === 'admin' ? 'danger' : 'info'" effect="dark">{{ chain.user.role }}</el-tag>
          </div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">{{ t('boundaryUserId') }}</div>
          <span data-testid="boundary-user-id">{{ chain.user.id }}</span>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">{{ t('authChainEffectiveSince') }}</div>
          <el-tag size="small" type="info" effect="plain" data-testid="chain-effective">
            {{ chain.effectiveSince ? formatTime(chain.effectiveSince) : t('permissionLive') }}
          </el-tag>
        </div>
      </div>

      <div class="mt-3">
        <div class="text-caption text-medium-emphasis">{{ t('authChainBasis') }}</div>
        <div class="text-body-2" data-testid="boundary-basis">{{ basisText }}</div>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">{{ t('boundaryWhoHint') }}</div>
    </el-card>

    <!-- Q2 data: the capability list, including scope, actions and the server's reason. -->
    <!-- Q2 数据：能力清单，含 scope、actions 与服务端给的理由。 -->
    <el-card shadow="never" class="mb-4" data-testid="boundary-data">
      <template #header>
        <div class="flex items-center gap-2">
          <AppIcon icon="mdi-database-lock-outline" />
          <span>{{ t('boundaryData') }}</span>
          <el-tag size="small" type="info" effect="plain">{{ dataRows.length }}</el-tag>
        </div>
      </template>

      <el-table v-loading="loading" :data="dataRows" empty-text="—" data-testid="boundary-data-table">
        <el-table-column prop="subject" :label="t('permissionSubject')" min-width="160" />
        <el-table-column :label="t('permissionScope')" width="190">
          <template #default="{ row }">
            <el-tag :type="row.scope === 'all' ? 'success' : 'warning'" size="small">{{ row.scope }}</el-tag>
            <el-tag
              v-if="isReadOnly(row)"
              size="small"
              type="info"
              effect="plain"
              class="ms-1"
              :title="t('boundaryReadOnlyHint')"
              data-testid="boundary-readonly"
            >
              {{ t('boundaryReadOnly') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('boundaryActions')" min-width="200">
          <template #default="{ row }">
            <template v-if="row.actions">
              <el-tag v-for="a in row.actions" :key="a" size="small" effect="plain" class="me-1">{{ a }}</el-tag>
            </template>
            <span v-else class="text-caption text-medium-emphasis">{{ t('boundaryNoActions') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" :label="t('permissionReason')" min-width="240" />
      </el-table>

      <div class="text-caption text-medium-emphasis mt-2">{{ t('boundaryDataHint') }}</div>
      <el-alert type="info" :title="t('boundaryDataScopeNote')" :closable="false" class="mt-2" />
    </el-card>

    <!-- Q3 tools: full registry + effective gate for admins; policy-configured subset for users. -->
    <!-- Q3 工具：管理员看完整注册表 + 生效门控；普通用户看策略中显式配置的子集。 -->
    <el-card shadow="never" class="mb-4" data-testid="boundary-tools">
      <template #header>
        <div class="flex items-center gap-2">
          <AppIcon icon="mdi-tools" />
          <span>{{ t('boundaryTools') }}</span>
          <el-tag size="small" type="info" effect="plain">{{ toolRows.length }}</el-tag>
        </div>
      </template>

      <div v-if="fingerprint" class="d-flex flex-wrap align-center ga-2 mb-3 text-body-2" data-testid="boundary-tool-fingerprint">
        <span class="text-caption text-medium-emphasis">{{ t('boundaryToolFingerprint') }}</span>
        <el-tag size="small" effect="plain">{{ fingerprint.total }}</el-tag>
        <span class="text-caption">{{ t('boundaryToolFingerprintRead') }} {{ fingerprint.read }}</span>
        <span class="text-caption">{{ t('boundaryToolFingerprintWrite') }} {{ fingerprint.write }}</span>
        <span class="text-caption text-medium-emphasis">{{ t('boundaryToolFingerprintRisk') }}</span>
        <el-tag v-for="r in riskEntries" :key="r.level" size="small" effect="plain">{{ r.level }} {{ r.count }}</el-tag>
      </div>

      <el-table :data="toolRows" empty-text="—" data-testid="boundary-tools-table">
        <el-table-column prop="name" :label="t('boundaryToolName')" min-width="180" />
        <el-table-column :label="t('boundaryToolEnabled')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'danger'" size="small">
              {{ row.enabled ? t('enabled') : t('disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="showGate" :label="t('boundaryToolGate')" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.gateMode" :type="gateTagType(row.gateMode)" size="small" effect="light">
              {{ gateLabel(row.gateMode) }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('boundaryToolRisk')" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.riskLevel" size="small" effect="plain">{{ row.riskLevel }}</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('boundaryToolRoles')" min-width="180">
          <template #default="{ row }">
            <span v-if="row.allowedRoles.length">{{ row.allowedRoles.join(', ') }}</span>
            <span v-else class="text-medium-emphasis">{{ t('boundaryNoRoleLimit') }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="text-caption text-medium-emphasis mt-2">
        {{ showGate ? t('boundaryToolsHintAdmin') : t('boundaryToolsHintUser') }}
      </div>
      <div class="text-caption text-medium-emphasis">{{ t('boundaryToolFingerprintSource') }}</div>
      <div class="text-caption text-medium-emphasis">{{ t('boundaryRiskLegend') }}</div>
    </el-card>

    <!-- Q4 boundary: what happens beyond it, plus a server-decided probe. -->
    <!-- Q4 边界：越过边界会发生什么，以及由服务端裁决的探针。 -->
    <el-card shadow="never" data-testid="boundary-edge">
      <template #header>
        <div class="flex items-center gap-2">
          <AppIcon icon="mdi-shield-alert-outline" />
          <span>{{ t('boundaryEdge') }}</span>
        </div>
      </template>

      <ul class="text-body-2" style="padding-left: 18px; margin: 0">
        <li>{{ t('boundaryEdgeRule') }}</li>
        <li>{{ t('boundaryEdgeToolsRule') }}</li>
      </ul>

      <el-divider />

      <div class="font-weight-medium mb-1">{{ t('boundaryProbe') }}</div>
      <div class="text-caption text-medium-emphasis mb-2">{{ t('boundaryProbeHint') }}</div>
      <div class="d-flex flex-wrap align-center ga-3">
        <el-select v-model="probeAction" style="width: 130px" data-testid="boundary-probe-action">
          <el-option v-for="a in ACTIONS" :key="a" :label="a" :value="a" />
        </el-select>
        <el-select
          v-model="probeSubject"
          filterable
          allow-create
          default-first-option
          :placeholder="t('boundaryProbeSubject')"
          style="width: 220px"
          data-testid="boundary-probe-subject"
        >
          <el-option v-for="s in subjectOptions" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button
          type="primary"
          size="small"
          :loading="probeLoading"
          data-testid="boundary-probe-run"
          @click="runProbe"
        >
          {{ t('boundaryProbeRun') }}
        </el-button>
      </div>

      <div v-if="probeResult" class="mt-3" data-testid="boundary-probe-result">
        <el-alert
          :type="probeResult.allowed ? 'success' : 'error'"
          :closable="false"
          show-icon
          :title="`${probeResult.action} × ${probeResult.subject}`"
        >
          <div class="text-body-2 mt-1">
            <el-tag :type="probeResult.allowed ? 'success' : 'danger'" size="small">
              {{ probeResult.allowed ? t('boundaryProbeAllowed') : t('boundaryProbeDenied') }}
            </el-tag>
            <span class="ms-2">{{ probeResult.reason }}</span>
            <span v-if="!probeResult.allowed && probeResult.deniedBy" class="text-caption text-medium-emphasis ms-2">
              {{ t('boundaryProbeDeniedBy') }}: {{ probeResult.deniedBy }}
            </span>
          </div>
        </el-alert>
      </div>

      <div class="text-caption text-medium-emphasis mt-2">
        {{ isTarget ? t('boundaryProbeSourceTarget') : t('boundaryProbeSourceSelf') }}
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import PageHeader from '@/components/PageHeader.vue'
import { authApi, type AuthorizationChain, type ExplainResult } from '@/api/auth'
import { aiToolsApi } from '@/api/aiTools'
import { provenanceApi, type AiToolFingerprint } from '@/api/provenance'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { formatTime } from '@/utils/format'
import type { AdminAiTool } from '@/types/admin'

const { t } = useI18n()
const auth = useAuthStore()

const ACTIONS = ['manage', 'create', 'read', 'update', 'delete']

interface DataRow {
  subject: string
  scope: string
  // `null` = the target-user source (authorization chain) does not expose actions.
  // `null` = 目标用户来源（授权链）不暴露 actions。
  actions: string[] | null
  reason: string
}

interface ToolRow {
  name: string
  enabled: boolean
  gateMode?: AdminAiTool['gateMode']
  riskLevel?: string
  allowedRoles: string[]
}

const loading = ref(false)
const chain = ref<AuthorizationChain | null>(null)
const userOptions = ref<Array<{ id: number; username: string }>>([])
const targetUserId = ref<number | null>(null)
const inventory = ref<AdminAiTool[]>([])
const fingerprint = ref<AiToolFingerprint | null>(null)

const isTarget = computed(() => targetUserId.value != null)

// Self capabilities come from GET /auth/me/permissions; the chain is the fallback when the
// capability list is unavailable, so the page still shows server-returned scope and basis.
// 本人能力来自 GET /auth/me/permissions；清单不可用时回退授权链，页面仍显示服务端返回的 scope 与依据。
const selfDataRows = computed<DataRow[]>(() => {
  const resources = auth.permissions?.resources
  if (resources && resources.length > 0) {
    return resources.map((r) => ({ subject: r.subject, scope: r.scope, actions: r.actions, reason: r.reason }))
  }
  return (chain.value?.grants ?? []).map((g) => ({
    subject: g.resource,
    scope: g.scope,
    actions: null,
    reason: g.policy,
  }))
})

// The chain's grants do not carry `actions`; render the missing field rather than inventing one.
// 授权链的 grants 不含 `actions`；缺失就如实显示，不凭空补。
const targetDataRows = computed<DataRow[]>(() =>
  (chain.value?.grants ?? []).map((g) => ({
    subject: g.resource,
    scope: g.scope,
    actions: null,
    reason: g.policy,
  })),
)

const dataRows = computed(() => (isTarget.value ? targetDataRows.value : selfDataRows.value))

const basisText = computed(() => {
  if (!isTarget.value) return auth.permissions?.basis || chain.value?.grants[0]?.policy || '—'
  const policies = [...new Set((chain.value?.grants ?? []).map((g) => g.policy).filter(Boolean))]
  return policies.length > 0 ? policies.join(' · ') : '—'
})

// Admins can read the full registry (GET /ai/tools) with the effective gate; other roles only see
// the tools that have an explicit governance-policy entry in their own authorization chain.
// 管理员可读完整注册表（GET /ai/tools）与生效门控；其它角色只看本人授权链中策略显式配置的工具。
const showGate = computed(() => auth.isAdmin && inventory.value.length > 0)

const toolRows = computed<ToolRow[]>(() => {
  if (showGate.value) {
    return inventory.value.map((tool) => ({
      name: tool.name,
      enabled: tool.enabled,
      gateMode: tool.gateMode,
      riskLevel: tool.riskLevel,
      allowedRoles: tool.allowedRoles,
    }))
  }
  return (chain.value?.toolPolicies ?? []).map((tp) => ({
    name: tp.toolName,
    enabled: tp.enabled,
    riskLevel: tp.riskLevel,
    allowedRoles: tp.allowedRoles,
  }))
})

const RISK_ORDER = ['R1', 'R2', 'R3', 'R4', 'R5']

// The fingerprint is an aggregate the server publishes to every authenticated role;
// it answers "how many tools / read vs write / risk mix" without naming admin-only rows.
// 指纹是服务端向所有已登录角色公开的聚合读数；它回答「多少工具 / 读写 / 风险分布」，但不点名仅管理员可见的行。
const riskEntries = computed(() =>
  RISK_ORDER.filter((lv) => fingerprint.value?.byRisk[lv] != null).map((lv) => ({
    level: lv,
    count: fingerprint.value!.byRisk[lv],
  })),
)

const subjectOptions = computed(() => [...new Set(dataRows.value.map((r) => r.subject))])

const probeAction = ref('read')
const probeSubject = ref('')
const probeLoading = ref(false)
const probeResult = ref<ExplainResult | null>(null)

function isReadOnly(row: DataRow): boolean {
  if (!row.actions || row.actions.length === 0) return false
  return !row.actions.some((a) => a === 'create' || a === 'update' || a === 'delete' || a === 'manage')
}

function gateLabel(mode: AdminAiTool['gateMode']): string {
  if (mode === 'blocked') return t('riskBlocked')
  if (mode === 'approval') return t('riskApproval')
  if (mode === 'confirm') return t('riskConfirm')
  return t('riskAuto')
}

function gateTagType(mode: AdminAiTool['gateMode']): 'danger' | 'warning' | 'success' {
  if (mode === 'blocked') return 'danger'
  if (mode === 'approval' || mode === 'confirm') return 'warning'
  return 'success'
}

async function reload() {
  loading.value = true
  try {
    if (!isTarget.value) await auth.loadPermissions(true)
    chain.value = await authApi.authorizationChain(targetUserId.value ?? undefined)
    try {
      fingerprint.value = (await provenanceApi.get()).runtime.aiToolFingerprint
    } catch {
      fingerprint.value = null
    }
    if (auth.isAdmin) {
      try {
        inventory.value = await aiToolsApi.tools()
      } catch {
        inventory.value = []
      }
    }
    probeResult.value = null
    if (!probeSubject.value || !subjectOptions.value.includes(probeSubject.value)) {
      // Prefer a concrete subject over the admin's `all` pseudo-subject: probing `all` says
      // nothing about a data boundary. Fall back to `Event`, a subject CASL actually names.
      // 优先具体资源而非管理员的 `all` 伪主体：探测 `all` 说不清数据边界。回退到 CASL 真会命名的 `Event`。
      probeSubject.value = subjectOptions.value.find((s) => s !== 'all') ?? 'Event'
    }
  } finally {
    loading.value = false
  }
}

async function runProbe() {
  if (!probeSubject.value) return
  probeLoading.value = true
  try {
    probeResult.value =
      targetUserId.value != null
        ? await authApi.explainTarget(targetUserId.value, probeAction.value, probeSubject.value)
        : await authApi.explain(probeAction.value, probeSubject.value)
  } catch {
    probeResult.value = null
  } finally {
    probeLoading.value = false
  }
}

onMounted(async () => {
  if (!auth.permissions) await auth.loadPermissions()
  if (auth.isAdmin) {
    try {
      const res = await usersApi.list(1, 100)
      // Exclude self: the empty selection is the richer self view (it has `actions`).
      // 排除本人：留空即本人视图（它才带 `actions`）。
      userOptions.value = res.items
        .filter((u) => u.id !== auth.user?.id)
        .map((u) => ({ id: u.id, username: u.username }))
    } catch {
      userOptions.value = []
    }
  }
  await reload()
})
</script>

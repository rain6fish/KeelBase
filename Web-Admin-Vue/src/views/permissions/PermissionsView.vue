<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="permissions-view">
    <!-- §22.16 A-5 授权链图：授权者 → 被授权者 → 策略 → 资源 → 生效期 -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="flex items-center gap-2">
          <AppIcon icon="mdi-link-variant" />
          <span>{{ t('authChain') }}</span>
        </div>
      </template>
      <el-timeline v-if="chain">
        <!-- 1 授权者（角色由管理台分配，源头为系统 admin） -->
        <el-timeline-item type="primary" :hollow="true">
          <div class="text-caption text-medium-emphasis">{{ t('authChainAuthorizer') }}</div>
          <el-tag type="danger" effect="dark" data-testid="chain-authorizer"><AppIcon icon="mdi-shield-account" size="14" /> admin</el-tag>
        </el-timeline-item>
        <!-- 2 被授权者 -->
        <el-timeline-item type="primary">
          <div class="text-caption text-medium-emphasis">{{ t('authChainGrantee') }}</div>
          <div class="d-flex align-center ga-2">
            <span class="font-weight-medium" data-testid="permission-role">{{ chain.user.username ?? '-' }}</span>
            <el-tag :type="chain.user.role === 'admin' ? 'danger' : 'info'" effect="dark">{{ chain.user.role }}</el-tag>
          </div>
        </el-timeline-item>
        <!-- 3 策略（CASL 角色授权 + 治理审计粒度） -->
        <el-timeline-item type="warning">
          <div class="text-caption text-medium-emphasis">{{ t('authChainPolicy') }}</div>
          <div class="text-body-2">{{ permissions?.basis || t('permissionBasis') }}</div>
        </el-timeline-item>
        <!-- 4 资源（CASL subject 授权 + 工具策略） -->
        <el-timeline-item type="success">
          <div class="text-caption text-medium-emphasis mb-1">{{ t('authChainResource') }}</div>
          <div v-if="chain.grants.length" class="d-flex flex-wrap" style="gap:6px">
            <el-tag v-for="g in chain.grants" :key="g.resource" size="small" :type="g.scope === 'all' ? 'success' : 'warning'" effect="plain" class="chain-tag" :title="g.policy" data-testid="chain-grant">{{ g.resource }}</el-tag>
          </div>
          <div v-if="chain.toolPolicies.length" class="mt-2">
            <el-collapse>
              <el-collapse-item :title="`${t('authChainToolPolicy')} (${chain.toolPolicies.length})`" name="tools">
                <div v-for="tp in chain.toolPolicies" :key="tp.toolName" class="d-flex align-center ga-2 py-1 text-caption">
                  <span class="font-weight-medium" style="min-width:120px">{{ tp.toolName }}</span>
                  <el-tag v-if="!tp.enabled" type="danger" size="small">{{ t('disabled') }}</el-tag>
                  <el-tag v-if="tp.riskLevel" size="small" effect="plain">{{ tp.riskLevel }}</el-tag>
                  <span v-if="tp.allowedRoles.length" class="text-medium-emphasis">roles: {{ tp.allowedRoles.join(', ') }}</span>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-timeline-item>
        <!-- 5 生效期（策略当前实时；无历史版本） -->
        <el-timeline-item type="info">
          <div class="text-caption text-medium-emphasis">{{ t('authChainEffectiveSince') }}</div>
          <el-tag size="small" type="info" effect="plain" data-testid="chain-effective">{{ chain.effectiveSince ? formatTime(chain.effectiveSince) : t('permissionLive') }}</el-tag>
        </el-timeline-item>
      </el-timeline>
      <div v-else class="text-medium-emphasis">{{ t('loading') }}</div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span>{{ t('permissionResources') }}</span>
          <el-button size="small" data-testid="permission-refresh" @click="reload">
            {{ t('permissionRefresh') }}
          </el-button>
        </div>
      </template>

      <el-table :data="resources" v-loading="loading" empty-text="—">
        <el-table-column prop="subject" :label="t('permissionSubject')" min-width="180" />
        <el-table-column :label="t('permissionScope')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.scope === 'all' ? 'success' : 'warning'" size="small">{{ row.scope }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" :label="t('permissionReason')" min-width="240" />
      </el-table>

      <el-alert type="info" :title="t('permissionRenderOnly')" :closable="false" class="mt-4" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { authApi, type AuthorizationChain } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { formatTime } from '@/utils/format'

const { t } = useI18n()
const auth = useAuthStore()
const loading = ref(false)

const permissions = computed(() => auth.permissions)
const resources = computed(() => permissions.value?.resources ?? [])
/** §22.16 A-5 授权链图：完整授权链（授权者→被授权者→策略→资源→生效期） */
const chain = ref<AuthorizationChain | null>(null)

async function reload() {
  loading.value = true
  try {
    auth.permissions = await authApi.myPermissions()
    chain.value = await authApi.authorizationChain()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!auth.permissions) await auth.loadPermissions()
  if (!chain.value) await reload()
})
</script>

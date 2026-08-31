<template>
  <div class="permissions-view">
    <!-- A-5 授权链可视化：用户 → 角色 → CASL 规则 → 资源（谁、基于什么授权、能做什么） -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="flex items-center gap-2">
          <AppIcon icon="mdi-link-variant" />
          <span>{{ t('authChain') }}</span>
        </div>
      </template>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item :label="t('authChainUser')">{{ auth.user?.username ?? '-' }}</el-descriptions-item>
        <el-descriptions-item :label="t('authChainRole')">
          <el-tag :type="isAdmin ? 'danger' : 'info'" effect="dark" data-testid="permission-role">{{ roleLabel }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('authChainBasis')" :span="2">{{ permissions?.basis || t('permissionBasis') }}</el-descriptions-item>
        <el-descriptions-item :label="t('authChainResources')" :span="2">
          <span class="font-weight-medium">{{ resources.length }}</span>
          <span class="text-caption text-medium-emphasis ml-1">{{ t('authChainResourceHint') }}</span>
        </el-descriptions-item>
      </el-descriptions>
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
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const loading = ref(false)

const permissions = computed(() => auth.permissions)
const resources = computed(() => permissions.value?.resources ?? [])
const isAdmin = computed(() => auth.isAdmin)
const roleLabel = computed(() => (isAdmin.value ? t('roleAdmin') : t('roleUser')))

async function reload() {
  loading.value = true
  try {
    auth.permissions = await authApi.myPermissions()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!auth.permissions) await auth.loadPermissions()
})
</script>

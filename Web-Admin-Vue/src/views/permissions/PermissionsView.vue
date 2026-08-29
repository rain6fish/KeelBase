<template>
  <div class="permissions-view">
    <el-card shadow="never" class="mb-4">
      <div class="flex items-center gap-3 flex-wrap">
        <el-tag :type="isAdmin ? 'danger' : 'info'" effect="dark" data-testid="permission-role">
          {{ roleLabel }}
        </el-tag>
        <span class="text-caption text-medium-emphasis">{{ permissions?.basis || t('permissionBasis') }}</span>
      </div>
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

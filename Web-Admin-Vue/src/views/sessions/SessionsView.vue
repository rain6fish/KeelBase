<template>
  <div>
    <PageHeader :title="t('sessionTitle')">
      <el-button @click="load">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <AppTable :headers="headers" :items="sessions" :loading="loading" :total="sessions.length" :items-per-page="sessions.length || 1">
      <template #item.deviceName="{ item }">{{ item.deviceName || t('unknownDevice') }}</template>
      <template #item.lastActiveAt="{ item }">{{ formatTime(item.lastActiveAt) }}</template>
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmRevoke(item)">
          <AppIcon icon="mdi-logout" />
        </el-button>
      </template>
    </AppTable>

    <ConfirmDialog
      v-model="showRevoke"
      :title="t('revokeConfirmTitle')"
      :content="t('revokeConfirmContent', { name: pending?.username || pending?.userId || '', id: pending?.id || '' })"
      @confirm="onRevoke"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'
import { formatTime } from '@/utils/format'
import type { AdminSession } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const sessions = ref<AdminSession[]>([])
const loading = ref(false)

const headers = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'username', title: t('userCol') },
  { key: 'deviceName', title: t('deviceCol') },
  { key: 'ip', title: t('ipCol') },
  { key: 'lastActiveAt', title: t('lastActive') },
  { key: 'actions', title: t('actionCol') },
])

async function load() {
  loading.value = true
  try {
    sessions.value = await adminApi.sessions()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

// 强下线
const showRevoke = ref(false)
const pending = ref<AdminSession | null>(null)
function confirmRevoke(s: AdminSession) {
  pending.value = s
  showRevoke.value = true
}
async function onRevoke() {
  if (!pending.value) return
  try {
    await adminApi.revokeSession(pending.value.id)
    snackbar.success(t('revoked'))
    load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('revokeFailed'))
  } finally {
    showRevoke.value = false
  }
}

onMounted(load)
</script>

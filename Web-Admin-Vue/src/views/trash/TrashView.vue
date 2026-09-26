<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navTrash')" :subtitle="t('total', { n: total })">
      <el-button @click="load(1)">
        <template #icon><AppIcon icon="mdi-refresh" /></template>
        {{ t('refresh') }}
      </el-button>
    </PageHeader>

    <AppTable :headers="headers" :items="trash" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.type="{ item }">
        <StatusChip :status="item.type" :label-map="typeLabelMap" />
      </template>
      <template #item.title="{ item }">{{ item.title ?? `#${item.id}` }}</template>
      <template #item.deletedAt="{ item }">{{ formatTime(item.deletedAt) }}</template>
      <template #item.actions="{ item }">
        <el-button text size="small" type="primary" :title="t('restore')" @click="confirmRestore(item)">
          <AppIcon icon="mdi-restore" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <ConfirmDialog
      v-model="showRestore"
      :title="t('restore')"
      :content="t('restoreConfirm', { title: pending?.title || '' })"
      color="primary"
      @confirm="onRestore"
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
import { adminApi } from '@/api/admin'
import { formatTime } from '@/utils/format'
import type { TrashItem } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const trash = ref<TrashItem[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)

const headers = computed(() => [
  { key: 'type', title: t('typeLabel') },
  { key: 'title', title: t('titleLabel') },
  { key: 'username', title: t('userCol') },
  { key: 'deletedAt', title: t('deletedAt') },
  { key: 'actions', title: t('actionCol') },
])

// 回收站的类型集合由服务端从实体元数据派生（凡带软删列的实体都在内），所以这张表**必然**落后于
// 服务端：这里只负责把认得的那几个翻译过来，认不出的由 StatusChip 回落显示原始 type。
//
// The server derives the type set from entity metadata (every soft-deletable entity), so this map
// is necessarily behind it: it translates the ones we have words for, and StatusChip falls back to
// the raw type for anything else.
const typeLabelMap = computed(() => ({
  event: t('events'),
  todo: t('todos'),
  project: t('projects'),
  task: t('tasks'),
  contract: t('trashTypeContract'),
  note: t('trashTypeNote'),
  book: t('trashTypeBook'),
  post: t('trashTypePost'),
  supplier: t('trashTypeSupplier'),
  tag: t('trashTypeTag'),
  crm_customer: t('trashTypeCrmCustomer'),
  crm_task: t('trashTypeCrmTask'),
  approval_request: t('trashTypeApprovalRequest'),
  organization: t('trashTypeOrganization'),
  department: t('trashTypeDepartment'),
  flow_instance: t('trashTypeFlowInstance'),
}))

async function load(p = 1) {
  loading.value = true
  try {
    const res = await adminApi.trash(p, limit)
    trash.value = res.items
    total.value = res.total
    page.value = p
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

const showRestore = ref(false)
const pending = ref<TrashItem | null>(null)
function confirmRestore(item: TrashItem) {
  pending.value = item
  showRestore.value = true
}
async function onRestore() {
  if (!pending.value) return
  try {
    await adminApi.restoreTrash(pending.value.type, pending.value.id)
    snackbar.success(t('restored'))
    load(page.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('restoreFailed'))
  } finally {
    showRestore.value = false
  }
}

onMounted(() => load(1))
</script>

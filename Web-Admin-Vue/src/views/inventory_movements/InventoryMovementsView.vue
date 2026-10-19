<!-- SPDX-License-Identifier: Apache-2.0 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { inventory_movementsApi, type AdminInventoryMovement } from '@/api/inventory_movements'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const items = ref<AdminInventoryMovement[]>([])
const loading = ref(false)
const showDelete = ref(false)
const pendingDelete = ref<AdminInventoryMovement | null>(null)

const headers = computed(() => [
  { key: 'id', title: 'ID' },
  { key: 'documentNo', title: 'documentNo' },
  { key: 'sku', title: 'sku' },
  { key: 'itemName', title: 'itemName' },
  { key: 'direction', title: 'direction' },
  { key: 'quantity', title: 'quantity' },
  { key: 'unit', title: 'unit' },
  { key: 'partner', title: 'partner' },
  { key: 'occurredAt', title: 'occurredAt' },
  { key: 'note', title: 'note' },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

async function load() {
  loading.value = true
  try {
    items.value = await inventory_movementsApi.list()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function confirmDelete(item: AdminInventoryMovement) {
  pendingDelete.value = item
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await inventory_movementsApi.remove(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    await load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader :title="t('navInventoryMovements')" :subtitle="t('inventory_movementsViewSubtitle')" />
    <AppTable :headers="headers" :items="items" :loading="loading">
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>
    <ConfirmDialog
      v-model="showDelete"
      :title="t('inventory_movementsDeleteTitle')"
      :content="t('inventory_movementsDeleteContent')"
      @confirm="onDelete"
    />
  </div>
</template>

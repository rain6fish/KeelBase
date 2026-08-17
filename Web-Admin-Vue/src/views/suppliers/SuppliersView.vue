<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { suppliersApi, type AdminSupplier } from '@/api/suppliers'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const items = ref<AdminSupplier[]>([])
const loading = ref(false)
const showDelete = ref(false)
const pendingDelete = ref<AdminSupplier | null>(null)

const headers = computed(() => [
  { key: 'id', title: 'ID' },
  { key: 'name', title: 'name' },
  { key: 'contact', title: 'contact' },
  { key: 'status', title: 'status' },
  { key: 'riskLevel', title: 'riskLevel' },
  { key: 'annualSpend', title: 'annualSpend' },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

async function load() {
  loading.value = true
  try {
    items.value = await suppliersApi.list()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function confirmDelete(item: AdminSupplier) {
  pendingDelete.value = item
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await suppliersApi.remove(pendingDelete.value.id)
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
    <PageHeader :title="t('navSuppliers')" :subtitle="t('suppliersViewSubtitle')" />
    <AppTable :headers="headers" :items="items" :loading="loading">
      <template #item.actions="{ item }">
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="confirmDelete(item)" />
      </template>
    </AppTable>
    <ConfirmDialog
      v-model="showDelete"
      :title="t('suppliersDeleteTitle')"
      :content="t('suppliersDeleteContent')"
      @confirm="onDelete"
    />
  </div>
</template>

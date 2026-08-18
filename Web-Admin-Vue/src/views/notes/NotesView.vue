<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { notesApi, type AdminNote } from '@/api/notes'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const items = ref<AdminNote[]>([])
const loading = ref(false)
const showDelete = ref(false)
const pendingDelete = ref<AdminNote | null>(null)

const headers = computed(() => [
  { key: 'id', title: 'ID' },
  { key: 'title', title: 'title' },
  { key: 'content', title: 'content' },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

async function load() {
  loading.value = true
  try {
    items.value = await notesApi.list()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function confirmDelete(item: AdminNote) {
  pendingDelete.value = item
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await notesApi.remove(pendingDelete.value.id)
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
    <PageHeader :title="t('navNotes')" :subtitle="t('notesViewSubtitle')" />
    <AppTable :headers="headers" :items="items" :loading="loading">
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>
    <ConfirmDialog
      v-model="showDelete"
      :title="t('notesDeleteTitle')"
      :content="t('notesDeleteContent')"
      @confirm="onDelete"
    />
  </div>
</template>

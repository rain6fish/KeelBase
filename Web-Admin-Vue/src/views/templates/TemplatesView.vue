<template>
  <div>
    <PageHeader :title="t('navTemplates')" />

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <el-row v-else :gutter="16">
      <el-col v-for="tpl in templates" :key="tpl.id" :xs="24" :md="12" :lg="8">
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex align-center ga-2">
              <AppIcon icon="mdi-view-grid-plus-outline" color="var(--el-color-primary)" />
              {{ tpl.name }}
            </div>
          </template>
          <div class="text-body-2 text-medium-emphasis mb-3">{{ tpl.description }}</div>
          <div class="text-caption">
            {{ t('events') }}: {{ tpl.events.length }} · {{ t('todos') }}: {{ tpl.todos.length }}
          </div>
          <div class="d-flex justify-end mt-3">
            <el-button type="primary" plain :loading="importingId === tpl.id" @click="confirmImport(tpl)">
              <template #icon><AppIcon icon="mdi-download" /></template>
              {{ t('importTemplate') }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <div v-if="!loading && !templates.length" class="text-medium-emphasis pa-4">{{ t('noTemplates') }}</div>

    <ConfirmDialog
      v-model="showImport"
      :title="t('importTemplate')"
      :content="t('importTemplateConfirm', { name: pending?.name || '' })"
      color="primary"
      :loading="importingId !== null"
      @confirm="onImport"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { templatesApi } from '@/api/templates'
import type { AdminTemplate } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const templates = ref<AdminTemplate[]>([])
const loading = ref(true)
const importingId = ref<string | null>(null)

const showImport = ref(false)
const pending = ref<AdminTemplate | null>(null)

async function load() {
  loading.value = true
  try {
    templates.value = await templatesApi.list()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function confirmImport(tpl: AdminTemplate) {
  pending.value = tpl
  showImport.value = true
}
async function onImport() {
  if (!pending.value) return
  importingId.value = pending.value.id
  try {
    const res = await templatesApi.importTemplate(pending.value.id)
    snackbar.success(t('templateImported', { events: res.events, todos: res.todos }))
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('importFailed'))
  } finally {
    importingId.value = null
    showImport.value = false
  }
}

onMounted(load)
</script>

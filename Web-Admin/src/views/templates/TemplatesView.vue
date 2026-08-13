<template>
  <div>
    <PageHeader :title="t('navTemplates')" />

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <v-row v-else>
      <v-col v-for="tpl in templates" :key="tpl.id" cols="12" md="6" lg="4">
        <v-card>
          <v-card-title class="d-flex align-center ga-2">
            <v-icon icon="mdi-view-grid-plus-outline" color="primary" />
            {{ tpl.name }}
          </v-card-title>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis mb-3">{{ tpl.description }}</div>
            <div class="text-caption">
              {{ t('events') }}: {{ tpl.events.length }} · {{ t('todos') }}: {{ tpl.todos.length }}
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" variant="tonal" prepend-icon="mdi-download" :loading="importingId === tpl.id" @click="confirmImport(tpl)">
              {{ t('importTemplate') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

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

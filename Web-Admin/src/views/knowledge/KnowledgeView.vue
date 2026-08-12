<template>
  <div>
    <PageHeader :title="t('navKnowledge')" :subtitle="t('total', { n: total })">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">{{ t('newArticle') }}</v-btn>
      <v-btn variant="tonal" prepend-icon="mdi-upload" @click="fileInput?.click()">{{ t('uploadDocument') }}</v-btn>
      <input ref="fileInput" type="file" accept=".pdf,.docx" class="d-none" @change="onUploadFile" />
    </PageHeader>

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3">
        <DebouncedSearch v-model="q" :placeholder="t('searchKnowledge')" class="flex-grow-1" @search="load(1)" />
        <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="load(1)">{{ t('reset') }}</v-btn>
      </v-card-text>
    </v-card>

    <AppTable :headers="headers" :items="knowledge" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.category="{ item }">
        <v-chip v-if="item.category" size="small" variant="tonal">{{ item.category }}</v-chip>
        <span v-else>-</span>
      </template>
      <template #item.sourceFile="{ item }">
        <span v-if="item.sourceFile" class="text-caption">{{ item.sourceFile }}</span>
        <span v-else>-</span>
      </template>
      <template #item.actions="{ item }">
        <v-btn icon="mdi-pencil-outline" variant="text" size="small" @click="openEdit(item)" />
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="confirmDelete(item)" />
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <FormDialog v-model="showForm" :title="editing ? t('editArticle') : t('createArticle')" :loading="saving" @save="onSave">
      <v-form @submit.prevent="onSave">
        <v-text-field v-model="form.title" :label="t('titleLabel')" required />
        <v-text-field v-model="form.category" :label="t('categoryOptional')" />
        <v-textarea v-model="form.content" :label="t('contentMarkdown')" rows="6" required />
      </v-form>
    </FormDialog>

    <ConfirmDialog
      v-model="showDelete"
      :title="t('deleteArticleTitle')"
      :content="t('deleteArticleContent', { title: pendingDelete?.title || '' })"
      @confirm="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import DebouncedSearch from '@/components/DebouncedSearch.vue'
import FormDialog from '@/components/FormDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { knowledgeApi } from '@/api/knowledge'
import type { KnowledgeArticle } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const knowledge = ref<KnowledgeArticle[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const q = ref('')

const headers = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'title', title: t('titleLabel') },
  { key: 'category', title: t('categoryOptional') },
  { key: 'sourceFile', title: t('sourceFile') },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

async function load(p = 1) {
  loading.value = true
  try {
    const res = await knowledgeApi.list(p, limit, q.value || undefined)
    knowledge.value = res.items
    total.value = res.total
    page.value = p
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

// 新建/编辑
const showForm = ref(false)
const editing = ref<KnowledgeArticle | null>(null)
const saving = ref(false)
const form = ref({ title: '', content: '', category: '' })

function openCreate() {
  editing.value = null
  form.value = { title: '', content: '', category: '' }
  showForm.value = true
}
function openEdit(item: KnowledgeArticle) {
  editing.value = item
  form.value = { title: item.title, content: item.content, category: item.category || '' }
  showForm.value = true
}
async function onSave() {
  if (!form.value.title.trim() || !form.value.content.trim()) {
    snackbar.error(t('titleContentRequired'))
    return
  }
  saving.value = true
  try {
    const data = { title: form.value.title.trim(), content: form.value.content, category: form.value.category || undefined }
    if (editing.value) {
      await knowledgeApi.update(editing.value.id, data)
    } else {
      await knowledgeApi.create(data)
    }
    snackbar.success(t('saved'))
    showForm.value = false
    load(page.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('saveFailed'))
  } finally {
    saving.value = false
  }
}

// 删除
const showDelete = ref(false)
const pendingDelete = ref<KnowledgeArticle | null>(null)
function confirmDelete(item: KnowledgeArticle) {
  pendingDelete.value = item
  showDelete.value = true
}
async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await knowledgeApi.remove(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    load(page.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

// 上传
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
async function onUploadFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await knowledgeApi.upload(file)
    snackbar.success(t('uploadSuccess'))
    input.value = ''
    load(1)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('uploadFailed'))
  } finally {
    uploading.value = false
  }
}

onMounted(() => load(1))
</script>

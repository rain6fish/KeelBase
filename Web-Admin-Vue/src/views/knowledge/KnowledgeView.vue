<template>
  <div>
    <PageHeader :title="t('navKnowledge')" :subtitle="t('total', { n: total })">
      <el-button type="primary" @click="openCreate">
        <template #icon><AppIcon icon="mdi-plus" /></template>
        {{ t('newArticle') }}
      </el-button>
      <el-button @click="fileInput?.click()">
        <template #icon><AppIcon icon="mdi-upload" /></template>
        {{ t('uploadDocument') }}
      </el-button>
      <input ref="fileInput" type="file" accept=".pdf,.docx" class="d-none" @change="onUploadFile" />
    </PageHeader>

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3">
        <DebouncedSearch v-model="q" :placeholder="t('searchKnowledge')" class="flex-grow-1" @search="load(1)" />
        <el-button @click="load(1)">
          <template #icon><AppIcon icon="mdi-refresh" /></template>
          {{ t('reset') }}
        </el-button>
      </div>
    </el-card>

    <AppTable :headers="headers" :items="knowledge" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.category="{ item }">
        <el-tag v-if="item.category" size="small" effect="light">{{ item.category }}</el-tag>
        <span v-else>-</span>
      </template>
      <template #item.sourceFile="{ item }">
        <span v-if="item.sourceFile" class="text-caption">{{ item.sourceFile }}</span>
        <span v-else>-</span>
      </template>
      <template #item.actions="{ item }">
        <el-button text size="small" @click="openEdit(item)">
          <AppIcon icon="mdi-pencil-outline" />
        </el-button>
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <FormDialog v-model="showForm" :title="editing ? t('editArticle') : t('createArticle')" :loading="saving" @save="onSave">
      <el-form @submit.prevent="onSave">
        <el-form-item :label="t('titleLabel')">
          <el-input v-model="form.title" required />
        </el-form-item>
        <el-form-item :label="t('categoryOptional')">
          <el-input v-model="form.category" />
        </el-form-item>
        <el-form-item :label="t('contentMarkdown')">
          <el-input v-model="form.content" type="textarea" :rows="6" required />
        </el-form-item>
      </el-form>
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

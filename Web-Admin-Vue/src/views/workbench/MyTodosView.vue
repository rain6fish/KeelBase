<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('workbenchMyTodos')" :subtitle="t('todoTotal', { n: todos.length })">
      <el-button plain @click="openCreate">
        <template #icon><AppIcon icon="mdi-plus" /></template>
        {{ t('addTodo') }}
      </el-button>
    </PageHeader>

    <AppTable :headers="headers" :items="todos" :loading="loading" :total="todos.length" :items-per-page="todos.length || 1">
      <template #item.title="{ item }">
        <span :class="item.completed ? 'text-medium-emphasis text-decoration-line-through' : ''">{{ item.title }}</span>
      </template>
      <template #item.dueDate="{ item }">{{ formatTime(item.dueDate) }}</template>
      <template #item.completed="{ item }">
        <el-checkbox :model-value="item.completed" @change="toggle(item)" />
      </template>
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>

    <FormDialog v-model="showCreate" :title="t('addTodo')" icon="mdi-plus-circle-outline" :loading="creating" @save="onCreate">
      <el-form @submit.prevent="onCreate">
        <el-form-item :label="t('titleLabel')" required class="mb-3">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item :label="t('contentLabel')" class="mb-3">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('dueDateCol')">
          <el-input v-model="form.dueDate" type="date" />
        </el-form-item>
      </el-form>
    </FormDialog>

    <ConfirmDialog
      v-model="showDelete"
      :title="t('deleteTodoTitle')"
      :content="t('deleteTodoContent', { title: pendingDelete?.title || '' })"
      @confirm="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import FormDialog from '@/components/FormDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { workbenchApi } from '@/api/workbench'
import { isEmailNotVerified } from '@/api/client'
import { formatTime } from '@/utils/format'
import type { CreateTodoInput, MyTodo } from '@/types/workbench'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const todos = ref<MyTodo[]>([])
const loading = ref(false)

const headers = computed(() => [
  { key: 'title', title: t('titleLabel') },
  { key: 'dueDate', title: t('dueDateCol') },
  { key: 'completed', title: t('completed') },
  { key: 'actions', title: t('actionCol') },
])

async function load() {
  loading.value = true
  try {
    todos.value = await workbenchApi.todos()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

// 新建
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ title: '', description: '', dueDate: '' })

function openCreate() {
  form.title = ''
  form.description = ''
  form.dueDate = ''
  showCreate.value = true
}
async function onCreate() {
  if (!form.title.trim()) {
    snackbar.warning(t('titleRequired'))
    return
  }
  creating.value = true
  try {
    const d: CreateTodoInput = { title: form.title.trim(), description: form.description.trim() || undefined }
    if (form.dueDate) d.dueDate = new Date(form.dueDate).toISOString()
    await workbenchApi.createTodo(d)
    snackbar.success(t('todoCreated'))
    showCreate.value = false
    load()
  } catch (err) {
    if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
    else snackbar.error(err instanceof Error ? err.message : t('createFailed'))
  } finally {
    creating.value = false
  }
}

// 勾选完成（mutation 后重拉，后端 completed ASC 自动置底）
async function toggle(item: MyTodo) {
  try {
    await workbenchApi.toggleTodo(item.id)
    load()
  } catch (err) {
    if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
    else snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
  }
}

// 删除
const showDelete = ref(false)
const pendingDelete = ref<MyTodo | null>(null)
function confirmDelete(todo: MyTodo) {
  pendingDelete.value = todo
  showDelete.value = true
}
async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await workbenchApi.removeTodo(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    load()
  } catch (err) {
    if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
    else snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

onMounted(load)
</script>

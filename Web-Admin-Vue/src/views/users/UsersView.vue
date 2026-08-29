<template>
  <div>
    <PageHeader :title="t('navUsers')" :subtitle="t('userTotal', { n: total })">
      <el-button type="primary" @click="openCreate">
        <template #icon><AppIcon icon="mdi-plus" /></template>
        {{ t('newUser') }}
      </el-button>
    </PageHeader>

    <el-card shadow="never" class="mb-4">
      <div class="d-flex ga-3 flex-wrap">
        <DebouncedSearch
          v-model="searchInput"
          :placeholder="t('searchUserPlaceholder')"
          class="flex-grow-1"
          style="max-width: 320px"
          @search="onSearch"
        />
        <el-button @click="load(1)">
          <template #icon><AppIcon icon="mdi-refresh" /></template>
          {{ t('reset') }}
        </el-button>
      </div>
    </el-card>

    <AppTable
      :headers="headers"
      :items="users"
      :loading="loading"
      :total="total"
      :items-per-page="limit"
    >
      <template #item.username="{ item }">
        <a class="text-decoration-none" href="#" @click.prevent="openDetail(item.id)">{{ item.username }}</a>
      </template>
      <template #item.role="{ item }">
        <el-select
          :model-value="item.role"
          style="max-width: 110px"
          @update:model-value="(v: string | number | boolean | undefined) => onChangeRole(item.id, String(v ?? ''))"
        >
          <el-option label="user" value="user" />
          <el-option label="admin" value="admin" />
        </el-select>
      </template>
      <template #item.createdAt="{ item }">
        {{ formatTime(item.createdAt) }}
      </template>
      <template #item.actions="{ item }">
        <el-button v-permission="'user.manage'" text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <!-- 新建用户 -->
    <FormDialog
      v-model="showCreate"
      :title="t('newUser')"
      :loading="creating"
      @save="onCreate"
    >
      <el-form @submit.prevent="onCreate">
        <el-form-item :label="t('usernameCol')">
          <el-input v-model="createForm.username" required />
        </el-form-item>
        <el-form-item label="Email">
          <el-input v-model="createForm.email" type="email" required />
        </el-form-item>
        <el-form-item :label="t('password')">
          <el-input v-model="createForm.password" type="password" required />
        </el-form-item>
        <el-form-item :label="t('nicknameCol')">
          <el-input v-model="createForm.nickname" required />
        </el-form-item>
        <el-row :gutter="8">
          <el-col :span="12">
            <el-form-item label="First name">
              <el-input v-model="createForm.firstName" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Last name">
              <el-input v-model="createForm.lastName" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </FormDialog>

    <!-- 删除确认 -->
    <ConfirmDialog
      v-model="showDelete"
      :title="t('deleteUserTitle')"
      :content="t('deleteUserContent', { name: pendingDelete?.username || '' })"
      @confirm="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import DebouncedSearch from '@/components/DebouncedSearch.vue'
import FormDialog from '@/components/FormDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { usersApi } from '@/api/users'
import { formatTime } from '@/utils/format'
import type { AdminUser, UserRole } from '@/types/user'

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const users = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const searchInput = ref('')

const headers = [
  { key: 'id', title: t('idCol') },
  { key: 'username', title: t('usernameCol') },
  { key: 'email', title: t('emailCol') },
  { key: 'role', title: t('roleCol') },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
]

async function load(p = 1) {
  loading.value = true
  try {
    const res = await usersApi.list(p, limit, searchInput.value || undefined)
    users.value = res.items
    total.value = res.total
    page.value = p
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function onSearch() {
  load(1)
}

// 新建
const showCreate = ref(false)
const creating = ref(false)
const emptyCreate = { username: '', email: '', password: '', nickname: '', firstName: '', lastName: '' }
const createForm = ref({ ...emptyCreate })

function openCreate() {
  createForm.value = { ...emptyCreate }
  showCreate.value = true
}

async function onCreate() {
  const f = createForm.value
  if (!f.username.trim() || !f.email.trim() || !f.password.trim() || !f.nickname.trim()) {
    snackbar.error(t('fillCreateForm'))
    return
  }
  creating.value = true
  try {
    await usersApi.create({
      username: f.username.trim(),
      email: f.email.trim(),
      password: f.password,
      nickname: f.nickname.trim(),
      firstName: f.firstName.trim() || undefined,
      lastName: f.lastName.trim() || undefined,
    })
    snackbar.success(t('userCreated'))
    showCreate.value = false
    load(1)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('createFailed'))
  } finally {
    creating.value = false
  }
}

// 改角色
async function onChangeRole(id: number, role: string) {
  try {
    await usersApi.updateRole(id, role as UserRole)
    snackbar.success(t('roleUpdated'))
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
    load(page.value)
  }
}

// 删除
const showDelete = ref(false)
const pendingDelete = ref<AdminUser | null>(null)
function confirmDelete(user: AdminUser) {
  pendingDelete.value = user
  showDelete.value = true
}
async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await usersApi.remove(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    load(page.value)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

function openDetail(id: number) {
  router.push(`/users/${id}`)
}

onMounted(() => load(1))
</script>

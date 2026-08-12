<template>
  <div>
    <PageHeader :title="t('navUsers')" :subtitle="t('userTotal', { n: total })">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">{{ t('newUser') }}</v-btn>
    </PageHeader>

    <v-card class="mb-4">
      <v-card-text class="d-flex ga-3 flex-wrap">
        <DebouncedSearch
          v-model="searchInput"
          :placeholder="t('searchUserPlaceholder')"
          class="flex-grow-1"
          style="max-width: 320px"
          @search="onSearch"
        />
        <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="load(1)">{{ t('reset') }}</v-btn>
      </v-card-text>
    </v-card>

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
        <v-select
          :model-value="item.role"
          :items="['user', 'admin']"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 110px"
          @update:model-value="(v) => onChangeRole(item.id, v as string)"
        />
      </template>
      <template #item.createdAt="{ item }">
        {{ formatTime(item.createdAt) }}
      </template>
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-delete-outline"
          variant="text"
          size="small"
          color="error"
          @click="confirmDelete(item)"
        />
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
      <v-form @submit.prevent="onCreate">
        <v-text-field v-model="createForm.username" :label="t('usernameCol')" required />
        <v-text-field v-model="createForm.email" label="Email" type="email" required />
        <v-text-field v-model="createForm.password" :label="t('password')" type="password" required />
        <v-text-field v-model="createForm.nickname" :label="t('nicknameCol')" required />
        <v-row>
          <v-col cols="6">
            <v-text-field v-model="createForm.firstName" label="First name" />
          </v-col>
          <v-col cols="6">
            <v-text-field v-model="createForm.lastName" label="Last name" />
          </v-col>
        </v-row>
      </v-form>
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

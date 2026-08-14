<template>
  <div>
    <PageHeader :title="t('workbenchNotifications')">
      <v-btn variant="tonal" prepend-icon="mdi-check-all" @click="onReadAll">{{ t('markAllRead') }}</v-btn>
    </PageHeader>

    <v-row class="mb-4">
      <v-col cols="12" sm="6" md="3">
        <StatCard :label="t('unreadCount')" :value="unread" icon="mdi-bell-badge-outline" color="warning" />
      </v-col>
    </v-row>

    <AppTable :headers="headers" :items="notifications" :loading="loading" :total="total" :items-per-page="limit">
      <template #item.title="{ item }">
        <div>{{ item.title }}</div>
        <div v-if="item.body" class="text-caption text-medium-emphasis">{{ item.body }}</div>
      </template>
      <template #item.type="{ item }">{{ item.type }}</template>
      <template #item.isRead="{ item }">
        <StatusChip :status="item.isRead ? 'read' : 'unread'" />
      </template>
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="!item.isRead"
          icon="mdi-email-open-outline"
          variant="text"
          size="small"
          :title="t('markRead')"
          @click="markRead(item)"
        />
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="confirmDelete(item)" />
      </template>
    </AppTable>

    <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" @update:page="load" />

    <ConfirmDialog
      v-model="showDelete"
      :title="t('deleteNotificationTitle')"
      :content="t('deleteNotificationContent', { title: pendingDelete?.title || '' })"
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
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StatCard from '@/components/StatCard.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { workbenchApi } from '@/api/workbench'
import { isEmailNotVerified } from '@/api/client'
import { formatTime } from '@/utils/format'
import type { MyNotification } from '@/types/workbench'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const notifications = ref<MyNotification[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const unread = ref(0)

const headers = computed(() => [
  { key: 'title', title: t('titleLabel') },
  { key: 'type', title: t('typeLabel') },
  { key: 'isRead', title: t('read') },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

async function load(p = 1) {
  loading.value = true
  try {
    const [res, count] = await Promise.all([workbenchApi.notifications(p, limit), workbenchApi.unreadCount()])
    notifications.value = res.items
    total.value = res.total
    page.value = p
    unread.value = count.count
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

async function refresh() {
  load(page.value)
}

// 标为已读
async function markRead(item: MyNotification) {
  try {
    await workbenchApi.readNotification(item.id)
    refresh()
  } catch (err) {
    if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
    else snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
  }
}

// 全部已读
async function onReadAll() {
  try {
    await workbenchApi.readAllNotifications()
    snackbar.success(t('markAllReadDone'))
    refresh()
  } catch (err) {
    if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
    else snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
  }
}

// 删除
const showDelete = ref(false)
const pendingDelete = ref<MyNotification | null>(null)
function confirmDelete(n: MyNotification) {
  pendingDelete.value = n
  showDelete.value = true
}
async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await workbenchApi.removeNotification(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    refresh()
  } catch (err) {
    if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
    else snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

onMounted(() => load(1))
</script>

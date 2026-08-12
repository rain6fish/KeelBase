<template>
  <div>
    <PageHeader :title="t('navNotifications')" />

    <v-card class="mx-auto" max-width="720">
      <v-card-text>
        <v-form @submit.prevent="onSend">
          <v-text-field v-model="form.title" :label="t('broadcastTitle')" required />
          <v-textarea v-model="form.body" :label="t('contentLabel')" rows="3" />
          <v-text-field v-model="form.type" :label="t('typeLabel')" :placeholder="t('typePlaceholder')" />
          <v-switch v-model="sendToAll" :label="t('sendToAll')" hide-details class="mb-2" />

          <div v-if="!sendToAll">
            <v-select
              v-model="selectedIds"
              :items="userOptions"
              item-title="label"
              item-value="value"
              :label="t('selectRecipients', { n: selectedIds.length })"
              multiple
              chips
              closable-chips
            />
          </div>

          <v-btn
            type="submit"
            color="primary"
            block
            size="large"
            :loading="sending"
            prepend-icon="mdi-send"
            class="mt-2"
          >
            {{ t('send') }}
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'
import { usersApi } from '@/api/users'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const form = ref({ title: '', body: '', type: '' })
const sendToAll = ref(true)
const selectedIds = ref<number[]>([])
const userOptions = ref<{ label: string; value: number }[]>([])
const sending = ref(false)

async function loadUsers() {
  try {
    const res = await usersApi.list(1, 100)
    userOptions.value = res.items.map((u) => ({ label: `${u.username} (${u.nickname})`, value: u.id }))
  } catch {
    // 选人列表加载失败静默，用户仍可发给全体
  }
}

async function onSend() {
  if (!form.value.title.trim()) {
    snackbar.error(t('titleRequired'))
    return
  }
  if (!sendToAll.value && selectedIds.value.length === 0) {
    snackbar.error(t('selectRequired'))
    return
  }
  sending.value = true
  try {
    const res = await adminApi.broadcast({
      title: form.value.title.trim(),
      body: form.value.body || undefined,
      type: form.value.type || undefined,
      ...(sendToAll.value ? {} : { userIds: selectedIds.value }),
    })
    snackbar.success(t('broadcastSent', { n: res.sent }))
    form.value = { title: '', body: '', type: '' }
    selectedIds.value = []
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('sendFailed'))
  } finally {
    sending.value = false
  }
}

onMounted(loadUsers)
</script>

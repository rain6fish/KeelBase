<template>
  <div>
    <PageHeader :title="t('navNotifications')" />

    <el-card shadow="never" class="mx-auto" style="max-width: 720px">
      <div class="pa-4">
        <el-form @submit.prevent="onSend" label-position="top">
          <el-form-item :label="t('broadcastTitle')">
            <el-input v-model="form.title" required />
          </el-form-item>
          <el-form-item :label="t('contentLabel')">
            <el-input v-model="form.body" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('typeLabel')">
            <el-input v-model="form.type" :placeholder="t('typePlaceholder')" />
          </el-form-item>
          <el-form-item>
            <el-switch v-model="sendToAll" :active-text="t('sendToAll')" class="mb-2" />
          </el-form-item>

          <el-form-item v-if="!sendToAll" :label="t('selectRecipients', { n: selectedIds.length })">
            <el-select v-model="selectedIds" multiple clearable style="width: 100%">
              <el-option v-for="opt in userOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>

          <el-button
            type="primary"
            native-type="submit"
            size="large"
            block
            :loading="sending"
            class="mt-2"
          >
            <template #icon><AppIcon icon="mdi-send" /></template>
            {{ t('send') }}
          </el-button>
        </el-form>
      </div>
    </el-card>
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

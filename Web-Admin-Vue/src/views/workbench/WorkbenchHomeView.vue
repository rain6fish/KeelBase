<template>
  <div>
    <PageHeader :title="t('navWorkbench')" :subtitle="t('workbenchSubtitle')" />

    <v-row>
      <v-col v-for="card in infoCards" :key="card.label" cols="12" sm="6" md="3">
        <StatCard v-bind="card" />
      </v-col>
    </v-row>

    <v-row>
      <v-col v-for="card in shortcutCards" :key="card.title" cols="12" sm="6" md="4">
        <v-card class="h-100" :to="card.to" link>
          <v-card-title>
            <v-icon :icon="card.icon" class="mr-2" color="primary" />
            {{ card.title }}
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-2">{{ card.desc }}</p>
            <v-chip size="small" variant="tonal" color="primary">{{ t('open') }}</v-chip>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { workbenchApi } from '@/api/workbench'

const { t } = useI18n()
const auth = useAuthStore()
const unread = ref(0)

// 登录响应不含 email 等完整字段，挂载时用 /auth/me 刷新完整资料；未读数失败静默
onMounted(async () => {
  try {
    auth.user = await authApi.me()
  } catch {
    // 忽略：守卫已保证 user 存在
  }
  try {
    const res = await workbenchApi.unreadCount()
    unread.value = res.count
  } catch {
    // 忽略：未读数为附加信息
  }
})

const user = computed(() => auth.user)

const infoCards = computed(() => [
  { label: t('username'), value: user.value?.username ?? '-', icon: 'mdi-account-outline', color: 'primary' },
  { label: t('nicknameCol'), value: user.value?.nickname || user.value?.username || '-', icon: 'mdi-badge-account-outline', color: 'success' },
  { label: t('emailCol'), value: user.value?.email || '-', icon: 'mdi-email-outline', color: 'info' },
  { label: t('unreadCount'), value: unread.value, icon: 'mdi-bell-badge-outline', color: 'warning' },
])

const shortcutCards = computed(() => [
  { title: t('workbenchMyEvents'), desc: t('workbenchMyEventsDesc'), icon: 'mdi-calendar-blank-outline', to: '/workbench/events' },
  { title: t('workbenchMyTodos'), desc: t('workbenchMyTodosDesc'), icon: 'mdi-checkbox-marked-circle-outline', to: '/workbench/todos' },
  { title: t('workbenchNotifications'), desc: t('workbenchNotificationsDesc'), icon: 'mdi-bell-outline', to: '/workbench/notifications' },
])
</script>

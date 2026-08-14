<template>
  <div>
    <PageHeader :title="t('navWorkbench')" :subtitle="t('workbenchSubtitle')" />

    <v-row>
      <v-col v-for="card in infoCards" :key="card.label" cols="12" sm="6" md="3">
        <StatCard v-bind="card" />
      </v-col>
    </v-row>

    <v-row>
      <v-col v-for="card in placeholderCards" :key="card.title" cols="12" sm="6" md="4">
        <v-card class="h-100">
          <v-card-title>
            <v-icon :icon="card.icon" class="mr-2" color="primary" />
            {{ card.title }}
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-2">{{ card.desc }}</p>
            <v-chip size="small" variant="outlined" color="primary">{{ t('workbenchComingSoon') }}</v-chip>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()

// 守卫已保证 auth.user 已加载（tryAutoLogin），直接读 store 不额外发请求
const user = computed(() => auth.user)

const infoCards = computed(() => [
  { label: t('username'), value: user.value?.username ?? '-', icon: 'mdi-account-outline', color: 'primary' },
  { label: t('nicknameCol'), value: user.value?.nickname || user.value?.username || '-', icon: 'mdi-badge-account-outline', color: 'success' },
  { label: t('emailCol'), value: user.value?.email || '-', icon: 'mdi-email-outline', color: 'info' },
  { label: t('roleCol'), value: user.value?.role ?? '-', icon: 'mdi-shield-account-outline', color: 'warning' },
])

const placeholderCards = computed(() => [
  { title: t('workbenchMyEvents'), desc: t('workbenchMyEventsDesc'), icon: 'mdi-calendar-blank-outline' },
  { title: t('workbenchMyTodos'), desc: t('workbenchMyTodosDesc'), icon: 'mdi-checkbox-marked-circle-outline' },
  { title: t('workbenchNotifications'), desc: t('workbenchNotificationsDesc'), icon: 'mdi-bell-outline' },
])
</script>

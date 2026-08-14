<template>
  <div>
    <PageHeader :title="`${t('navUsers')} #${id}`" :subtitle="detail?.username || ''">
      <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="router.back()">{{ t('back') }}</v-btn>
    </PageHeader>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <template v-else-if="detail">
      <v-row>
        <v-col cols="12" md="6">
          <v-card class="mb-4">
            <v-card-title>{{ t('appInfo') }}</v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item><template #prepend><v-icon icon="mdi-account" size="small" /></template>{{ t('usernameCol') }}：{{ detail.username }}</v-list-item>
                <v-list-item><template #prepend><v-icon icon="mdi-email" size="small" /></template>{{ t('emailCol') }}：{{ detail.email }}</v-list-item>
                <v-list-item><template #prepend><v-icon icon="mdi-shield-account" size="small" /></template>{{ t('roleCol') }}：{{ detail.role }}</v-list-item>
                <v-list-item><template #prepend><v-icon icon="mdi-clock-outline" size="small" /></template>{{ t('createdAt') }}：{{ formatTime(detail.createdAt) }}</v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-row>
            <v-col v-for="stat in statCards" :key="stat.label" cols="6">
              <StatCard v-bind="stat" />
            </v-col>
          </v-row>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title>{{ t('sessions') }}</v-card-title>
            <v-card-text>
              <v-list v-if="detail.sessions.length" density="compact">
                <v-list-item v-for="s in detail.sessions" :key="s.id">
                  <v-list-item-title>{{ s.deviceName || t('unknownDevice') }}</v-list-item-title>
                  <v-list-item-subtitle>{{ s.ip }} · {{ formatTime(s.lastActiveAt) }}</v-list-item-subtitle>
                </v-list-item>
              </v-list>
              <div v-else class="text-medium-emphasis">{{ t('noSessions') }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card>
            <v-card-title>{{ t('notifications') }}</v-card-title>
            <v-card-text>
              <v-list v-if="detail.notifications.length" density="compact">
                <v-list-item v-for="n in detail.notifications" :key="n.id">
                  <v-list-item-title>{{ n.title }} <StatusChip :status="n.isRead ? 'read' : 'unread'" :label-map="readMap" /></v-list-item-title>
                  <v-list-item-subtitle>{{ n.body }} · {{ formatTime(n.createdAt) }}</v-list-item-subtitle>
                </v-list-item>
              </v-list>
              <div v-else class="text-medium-emphasis">{{ t('noNotifications') }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusChip from '@/components/StatusChip.vue'
import { usersApi } from '@/api/users'
import { formatTime } from '@/utils/format'
import type { UserDetail } from '@/types/admin'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const id = Number(route.params.id)

const detail = ref<UserDetail | null>(null)
const loading = ref(true)

const readMap = { read: t('read'), unread: t('unread') }

const statCards = computed(() => [
  { label: t('events'), value: detail.value?.counts.events ?? '-', icon: 'mdi-calendar-blank-outline', color: 'success' },
  { label: t('opAuditLogs'), value: detail.value?.counts.operationAuditLogs ?? '-', icon: 'mdi-clipboard-text-outline', color: 'info' },
  { label: t('aiAuditLogs'), value: detail.value?.counts.aiAuditLogs ?? '-', icon: 'mdi-history', color: 'primary' },
  { label: t('totalTokens'), value: detail.value?.counts.totalTokens ?? '-', icon: 'mdi-database-outline', color: 'warning' },
])

async function load() {
  try {
    detail.value = await usersApi.detail(id)
  } catch {
    // global snackbar
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

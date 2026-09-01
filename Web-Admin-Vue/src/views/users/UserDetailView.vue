<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="`${t('navUsers')} #${id}`" :subtitle="detail?.username || ''">
      <el-button text @click="router.back()">
        <template #icon><AppIcon icon="mdi-arrow-left" /></template>
        {{ t('back') }}
      </el-button>
    </PageHeader>

    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('loading') }}</div>

    <template v-else-if="detail">
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="mb-4">
            <template #header>{{ t('appInfo') }}</template>
            <div class="d-flex align-center ga-2 py-1">
              <AppIcon icon="mdi-account" :size="16" class="text-medium-emphasis" />
              <span>{{ t('usernameCol') }}：{{ detail.username }}</span>
            </div>
            <div class="d-flex align-center ga-2 py-1">
              <AppIcon icon="mdi-email" :size="16" class="text-medium-emphasis" />
              <span>{{ t('emailCol') }}：{{ detail.email }}</span>
            </div>
            <div class="d-flex align-center ga-2 py-1">
              <AppIcon icon="mdi-shield-account" :size="16" class="text-medium-emphasis" />
              <span>{{ t('roleCol') }}：{{ detail.role }}</span>
            </div>
            <div class="d-flex align-center ga-2 py-1">
              <AppIcon icon="mdi-clock-outline" :size="16" class="text-medium-emphasis" />
              <span>{{ t('createdAt') }}：{{ formatTime(detail.createdAt) }}</span>
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-row :gutter="16">
            <el-col v-for="stat in statCards" :key="stat.label" :xs="24" :sm="12" :md="12">
              <StatCard v-bind="stat" />
            </el-col>
          </el-row>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-card shadow="never">
            <template #header>{{ t('sessions') }}</template>
            <div v-if="detail.sessions.length">
              <div v-for="s in detail.sessions" :key="s.id" class="py-1">
                <div class="text-body-2">{{ s.deviceName || t('unknownDevice') }}</div>
                <div class="text-caption text-medium-emphasis">{{ s.ip }} · {{ formatTime(s.lastActiveAt) }}</div>
              </div>
            </div>
            <div v-else class="text-medium-emphasis">{{ t('noSessions') }}</div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card shadow="never">
            <template #header>{{ t('notifications') }}</template>
            <div v-if="detail.notifications.length">
              <div v-for="n in detail.notifications" :key="n.id" class="py-1">
                <div class="text-body-2">{{ n.title }} <StatusChip :status="n.isRead ? 'read' : 'unread'" :label-map="readMap" /></div>
                <div class="text-caption text-medium-emphasis">{{ n.body }} · {{ formatTime(n.createdAt) }}</div>
              </div>
            </div>
            <div v-else class="text-medium-emphasis">{{ t('noNotifications') }}</div>
          </el-card>
        </el-col>
      </el-row>
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

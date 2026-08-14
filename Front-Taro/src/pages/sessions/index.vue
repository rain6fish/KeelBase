<template>
  <view class="sessions-page">
    <text class="sessions-page__title">Login Devices</text>
    <text class="sessions-page__subtitle">Devices that have access to your account</text>

    <view v-if="store.isLoading" class="sessions-page__loading">
      <view class="spinner" />
    </view>
    <view v-else-if="sessions.length === 0" class="sessions-page__empty">
      <text class="sessions-page__empty-text">No active sessions</text>
    </view>
    <view v-else class="sessions-page__list">
      <view v-for="s in sessions" :key="s.id" class="sessions-page__item">
        <view class="sessions-page__item-icon"><text>📱</text></view>
        <view class="sessions-page__item-info">
          <view class="sessions-page__item-header">
            <text class="sessions-page__item-name">{{ s.deviceName || 'Unknown Device' }}</text>
            <text v-if="s.isCurrent" class="sessions-page__item-current">Current</text>
          </view>
          <text class="sessions-page__item-meta">IP: {{ s.ip || '—' }} · Last active: {{ formatTime(s.lastActiveAt) }}</text>
          <text class="sessions-page__item-meta">Signed in: {{ formatTime(s.createdAt) }}</text>
        </view>
        <text v-if="!s.isCurrent" class="sessions-page__item-revoke" @click="handleRevoke(s)">Revoke</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '../../stores/session-store'

const store = useSessionStore()
const { sessions } = storeToRefs(store)

onMounted(() => {
  store.load()
})

function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function handleRevoke(session: { id: number; deviceName?: string }) {
  Taro.showModal({
    title: 'Revoke Device',
    content: `Sign out this device${session.deviceName ? ` (${session.deviceName})` : ''}?`,
    success: async (res) => {
      if (res.confirm) {
        try {
          await store.revoke(session.id)
          Taro.showToast({ title: 'Session revoked', icon: 'success' })
        } catch {
          Taro.showToast({ title: 'Failed to revoke', icon: 'none' })
        }
      }
    },
  })
}
</script>

<style src="./index.scss" scoped></style>

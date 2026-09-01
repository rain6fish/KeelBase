<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="sessions-page">
    <text class="sessions-page__title">{{ t('sessions.title') }}</text>
    <text class="sessions-page__subtitle">{{ t('sessions.subtitle') }}</text>

    <view v-if="store.isLoading" class="sessions-page__loading">
      <view class="spinner" />
    </view>
    <view v-else-if="sessions.length === 0" class="sessions-page__empty">
      <text class="sessions-page__empty-text">{{ t('sessions.empty') }}</text>
    </view>
    <view v-else class="sessions-page__list">
      <view v-for="s in sessions" :key="s.id" class="sessions-page__item">
        <view class="sessions-page__item-icon"><text>📱</text></view>
        <view class="sessions-page__item-info">
          <view class="sessions-page__item-header">
            <text class="sessions-page__item-name">{{ s.deviceName || t('sessions.unknownDevice') }}</text>
            <text v-if="s.isCurrent" class="sessions-page__item-current">{{ t('sessions.current') }}</text>
          </view>
          <text class="sessions-page__item-meta">{{ t('sessions.lastActive', { ip: s.ip || '—', time: formatTime(s.lastActiveAt) }) }}</text>
          <text class="sessions-page__item-meta">{{ t('sessions.signedIn', { time: formatTime(s.createdAt) }) }}</text>
        </view>
        <text v-if="!s.isCurrent" class="sessions-page__item-revoke" @click="handleRevoke(s)">{{ t('sessions.revoke') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '../../stores/session-store'
import { useI18n } from '../../composables/useI18n'

const store = useSessionStore()
const { sessions } = storeToRefs(store)
const { t } = useI18n()

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
    title: t('sessions.revokeTitle'),
    content: session.deviceName
      ? t('sessions.revokeConfirmWith', { device: session.deviceName })
      : t('sessions.revokeConfirm'),
    success: async (res) => {
      if (res.confirm) {
        try {
          await store.revoke(session.id)
          Taro.showToast({ title: t('sessions.revoked'), icon: 'success' })
        } catch {
          Taro.showToast({ title: t('sessions.revokeFailed'), icon: 'none' })
        }
      }
    },
  })
}
</script>


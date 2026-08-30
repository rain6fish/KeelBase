<template>
  <view class="profile-page">
    <!-- User info card -->
    <view class="profile-page__card card">
      <view class="profile-page__avatar">
        <text class="profile-page__avatar-text">{{ avatarChar }}</text>
      </view>
      <view class="profile-page__info">
        <text class="profile-page__name">{{ user?.nickname || t('profile.defaultUser') }}</text>
        <text class="profile-page__username">@{{ user?.username || t('profile.unknown') }}</text>
      </view>
    </view>

    <!-- Menu items -->
    <view
      v-for="item in menuItems"
      :key="item.label"
      class="profile-page__menu-item"
      @click="goTo(item.path)"
    >
      <text class="profile-page__menu-icon">{{ item.icon }}</text>
      <text class="profile-page__menu-label">{{ item.label }}</text>
      <text class="profile-page__menu-arrow">›</text>
    </view>

    <view class="profile-page__divider" />

    <!-- Sign out -->
    <view class="profile-page__signout" @click="handleLogout">
      <text class="profile-page__signout-text">{{ t('profile.signOut') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { computed } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../../stores/auth-store'
import { useI18n } from '../../composables/useI18n'

const store = useAuthStore()
const { user } = storeToRefs(store)
const { t } = useI18n()

const avatarChar = computed(() => user.value?.nickname?.[0]?.toUpperCase() || '?')

const menuItems = computed(() => [
  { icon: '📅', label: t('profile.myEvents'), path: '/pages/events/index' },
  { icon: '📤', label: t('profile.uploads'), path: '/pages/upload/index' },
  { icon: '🔔', label: t('profile.notifications'), path: '/pages/notifications/index' },
  { icon: '📱', label: t('profile.loginDevices'), path: '/pages/sessions/index' },
  { icon: '🔒', label: t('profile.privacyPolicy'), path: '/pages/privacy/index' },
  { icon: '📄', label: t('profile.terms'), path: '/pages/terms/index' },
])

function goTo(path: string) {
  Taro.navigateTo({ url: path })
}

function handleLogout() {
  Taro.showModal({
    title: t('profile.signOut'),
    content: t('profile.signOutConfirm'),
    success: async (res) => {
      if (res.confirm) {
        await store.logout()
        Taro.redirectTo({ url: '/pages/login/index' })
      }
    },
  })
}
</script>


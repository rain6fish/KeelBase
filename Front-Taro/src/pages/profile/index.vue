<template>
  <view class="profile-page">
    <!-- User info card -->
    <view class="profile-page__card card">
      <view class="profile-page__avatar">
        <text class="profile-page__avatar-text">{{ avatarChar }}</text>
      </view>
      <view class="profile-page__info">
        <text class="profile-page__name">{{ user?.nickname || 'User' }}</text>
        <text class="profile-page__username">@{{ user?.username || 'unknown' }}</text>
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
      <text class="profile-page__signout-text">Sign Out</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../../stores/auth-store'

const store = useAuthStore()
const { user } = storeToRefs(store)

const avatarChar = computed(() => user.value?.nickname?.[0]?.toUpperCase() || '?')

const menuItems = [
  { icon: '📅', label: 'My Events', path: '/pages/events/index' },
  { icon: '📤', label: 'Uploads', path: '/pages/upload/index' },
  { icon: '🔔', label: 'Notifications', path: '/pages/notifications/index' },
  { icon: '📱', label: 'Login Devices', path: '/pages/sessions/index' },
  { icon: '🔒', label: 'Privacy Policy', path: '/pages/privacy/index' },
  { icon: '📄', label: 'Terms of Service', path: '/pages/terms/index' },
]

function goTo(path: string) {
  Taro.navigateTo({ url: path })
}

function handleLogout() {
  Taro.showModal({
    title: 'Sign Out',
    content: 'Are you sure you want to sign out?',
    success: async (res) => {
      if (res.confirm) {
        await store.logout()
        Taro.redirectTo({ url: '/pages/login/index' })
      }
    },
  })
}
</script>

<style src="./index.scss" scoped></style>

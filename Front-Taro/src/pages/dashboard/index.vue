<template>
  <view class="dashboard">
    <!-- Welcome card -->
    <view class="dashboard__welcome card">
      <view class="dashboard__welcome-avatar">
        <text class="dashboard__welcome-avatar-text">{{ avatarInitial }}</text>
      </view>
      <view class="dashboard__welcome-info">
        <text class="dashboard__welcome-name">Welcome, {{ user?.nickname || 'User' }}</text>
        <text class="dashboard__welcome-username">@{{ user?.username || '...' }}</text>
      </view>
    </view>

    <!-- Navigation grid -->
    <view class="dashboard__grid">
      <view
        v-for="item in navItems"
        :key="item.title"
        class="dashboard__grid-item"
        :style="{ borderTopColor: item.color }"
        @click="handleNav(item)"
      >
        <text class="dashboard__grid-icon">{{ item.icon }}</text>
        <text class="dashboard__grid-label">{{ item.title }}</text>
      </view>
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

const avatarInitial = computed(() => user.value?.nickname?.[0]?.toUpperCase() || '?')

interface NavItem {
  icon: string
  title: string
  color: string
  path?: string
  action?: () => void
}

const navItems: NavItem[] = [
  { icon: '📅', title: 'Events', color: '#16A34A', path: '/pages/events/index' },
  { icon: '📤', title: 'Upload', color: '#F59E0B', path: '/pages/upload/index' },
  { icon: '🚪', title: 'Sign Out', color: '#DC2626', action: handleLogout },
]

function handleNav(item: NavItem) {
  if (item.action) item.action()
  else if (item.path) Taro.navigateTo({ url: item.path })
}

async function handleLogout() {
  await store.logout()
  Taro.redirectTo({ url: '/pages/login/index' })
}
</script>

<style src="./index.scss" scoped></style>

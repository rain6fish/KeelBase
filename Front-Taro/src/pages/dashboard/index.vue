<template>
  <view class="dashboard">
    <!-- Welcome card -->
    <view class="dashboard__welcome card">
      <view class="dashboard__welcome-avatar">
        <text class="dashboard__welcome-avatar-text">{{ avatarInitial }}</text>
      </view>
      <view class="dashboard__welcome-info">
        <text class="dashboard__welcome-name">{{ t('dashboard.welcome', { name: user?.nickname || t('dashboard.defaultUser') }) }}</text>
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
import './index.scss'
import { computed } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../../stores/auth-store'
import { useI18n } from '../../composables/useI18n'

const store = useAuthStore()
const { user } = storeToRefs(store)
const { t } = useI18n()

const avatarInitial = computed(() => user.value?.nickname?.[0]?.toUpperCase() || '?')

interface NavItem {
  icon: string
  title: string
  color: string
  path?: string
  action?: () => void
}

const navItems = computed<NavItem[]>(() => [
  { icon: '📅', title: t('dashboard.events'), color: '#16A34A', path: '/pages/events/index' },
  { icon: '📤', title: t('dashboard.upload'), color: '#F59E0B', path: '/pages/upload/index' },
  { icon: '🚪', title: t('dashboard.signOut'), color: '#DC2626', action: handleLogout },
])

function handleNav(item: NavItem) {
  if (item.action) item.action()
  else if (item.path) Taro.navigateTo({ url: item.path })
}

async function handleLogout() {
  await store.logout()
  Taro.redirectTo({ url: '/pages/login/index' })
}
</script>


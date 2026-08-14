<template>
  <view class="settings-page">
    <!-- Appearance -->
    <text class="settings-page__section">Appearance</text>
    <view class="settings-page__card card">
      <view class="settings-page__row">
        <text class="settings-page__row-icon">🎨</text>
        <text class="settings-page__row-label">Theme</text>
      </view>
      <view class="settings-page__theme-options">
        <view
          v-for="opt in themeOptions"
          :key="opt.value"
          class="settings-page__theme-option"
          :class="{ 'settings-page__theme-option--active': themeMode === opt.value }"
          @click="themeStore.setThemeMode(opt.value)"
        >
          <text class="settings-page__theme-icon">{{ opt.icon }}</text>
          <text class="settings-page__theme-label">{{ opt.label }}</text>
        </view>
      </view>
    </view>

    <!-- Account -->
    <text class="settings-page__section">Account</text>
    <view class="settings-page__card card">
      <view class="settings-page__row" @click="goTo('/pages/sessions/index')">
        <text class="settings-page__row-icon">📱</text>
        <text class="settings-page__row-label">Login Devices</text>
        <text class="settings-page__row-arrow">›</text>
      </view>
      <view class="settings-page__divider" />
      <view class="settings-page__row settings-page__row--danger" @click="handleLogout">
        <text class="settings-page__row-icon">🚪</text>
        <text class="settings-page__row-label">Sign Out</text>
      </view>
    </view>

    <!-- Legal -->
    <text class="settings-page__section">Legal</text>
    <view class="settings-page__card card">
      <view class="settings-page__row" @click="goTo('/pages/privacy/index')">
        <text class="settings-page__row-icon">🔒</text>
        <text class="settings-page__row-label">Privacy Policy</text>
        <text class="settings-page__row-arrow">›</text>
      </view>
      <view class="settings-page__divider" />
      <view class="settings-page__row" @click="goTo('/pages/terms/index')">
        <text class="settings-page__row-icon">📄</text>
        <text class="settings-page__row-label">Terms of Service</text>
        <text class="settings-page__row-arrow">›</text>
      </view>
    </view>

    <!-- App Info -->
    <text class="settings-page__section">App Info</text>
    <view class="settings-page__card card">
      <view class="settings-page__row">
        <text class="settings-page__row-icon">ℹ️</text>
        <text class="settings-page__row-label">Version</text>
        <text class="settings-page__row-value">v{{ appVersion }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useThemeStore, type ThemeMode } from '../../stores/theme-store'
import { useAuthStore } from '../../stores/auth-store'

const themeStore = useThemeStore()
const { themeMode } = storeToRefs(themeStore)
const authStore = useAuthStore()
const appVersion = ref('1.0.0')

const themeOptions: { label: string; value: ThemeMode; icon: string }[] = [
  { label: 'Light', value: 'light', icon: '☀️' },
  { label: 'Dark', value: 'dark', icon: '🌙' },
  { label: 'System', value: 'system', icon: '⚙️' },
]

function goTo(url: string) {
  Taro.navigateTo({ url })
}

function handleLogout() {
  Taro.showModal({
    title: 'Sign Out',
    content: 'Are you sure you want to sign out?',
    success: async (res) => {
      if (res.confirm) {
        await authStore.logout()
        Taro.redirectTo({ url: '/pages/login/index' })
      }
    },
  })
}
</script>

<style src="./index.scss" scoped></style>

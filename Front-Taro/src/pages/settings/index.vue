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

    <!-- Notifications -->
    <text class="settings-page__section">Notifications</text>
    <view class="settings-page__card card">
      <view
        class="settings-page__row"
        :class="{ 'settings-page__row--disabled': isH5 }"
        @click="handleEnableWechatReminder"
      >
        <text class="settings-page__row-icon">🔔</text>
        <text class="settings-page__row-label">Enable WeChat Event Reminders</text>
        <text class="settings-page__row-value">{{ isH5 ? 'H5 only' : '›' }}</text>
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

const isH5 = process.env.TARO_ENV === 'h5'
// MINI-2：构建时注入微信订阅消息模板 id（需与后端 WECHAT_REMIND_TEMPLATE_ID 一致）
const WECHAT_REMIND_TEMPLATE_ID = process.env.TARO_APP_WX_TEMPLATE_ID || ''

const themeOptions: { label: string; value: ThemeMode; icon: string }[] = [
  { label: 'Light', value: 'light', icon: '☀️' },
  { label: 'Dark', value: 'dark', icon: '🌙' },
  { label: 'System', value: 'system', icon: '⚙️' },
]

function goTo(url: string) {
  Taro.navigateTo({ url })
}

/** MINI-2：小程序订阅消息授权（事件提醒），须由用户点击手势触发 */
async function handleEnableWechatReminder() {
  if (isH5) {
    Taro.showToast({ title: 'WeChat reminders are only available in the mini program', icon: 'none' })
    return
  }
  if (!WECHAT_REMIND_TEMPLATE_ID) {
    Taro.showToast({ title: 'Reminder template not configured', icon: 'none' })
    return
  }
  try {
    const res = await Taro.requestSubscribeMessage({ tmplIds: [WECHAT_REMIND_TEMPLATE_ID] })
    const state = res[WECHAT_REMIND_TEMPLATE_ID]
    if (state === 'accept') {
      Taro.showToast({ title: 'WeChat reminders enabled', icon: 'success' })
    } else {
      Taro.showToast({ title: 'You declined WeChat reminders', icon: 'none' })
    }
  } catch (err: any) {
    Taro.showToast({ title: err?.errMsg || 'Failed to enable reminders', icon: 'none' })
  }
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

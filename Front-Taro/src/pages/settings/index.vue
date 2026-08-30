<template>
  <view class="settings-page">
    <!-- Appearance -->
    <text class="settings-page__section">{{ t('settings.appearance') }}</text>
    <view class="settings-page__card card">
      <view class="settings-page__row">
        <text class="settings-page__row-icon">🎨</text>
        <text class="settings-page__row-label">{{ t('settings.theme') }}</text>
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

    <!-- Language -->
    <text class="settings-page__section">{{ t('settings.language') }}</text>
    <view class="settings-page__card card">
      <view class="settings-page__row">
        <text class="settings-page__row-icon">🌐</text>
        <view class="settings-page__theme-options">
          <view
            v-for="opt in languageOptions"
            :key="opt.value"
            class="settings-page__theme-option"
            :class="{ 'settings-page__theme-option--active': i18n.locale === opt.value }"
            @click="i18n.setLocale(opt.value)"
          >
            <text class="settings-page__theme-label">{{ opt.label }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- Notifications -->
    <text class="settings-page__section">{{ t('settings.notifications') }}</text>
    <view class="settings-page__card card">
      <view
        class="settings-page__row"
        :class="{ 'settings-page__row--disabled': isH5 }"
        @click="handleEnableWechatReminder"
      >
        <text class="settings-page__row-icon">🔔</text>
        <text class="settings-page__row-label">{{ t('settings.wechatReminder') }}</text>
        <text class="settings-page__row-value">{{ isH5 ? t('settings.h5Only') : '›' }}</text>
      </view>
    </view>

    <!-- Account -->
    <text class="settings-page__section">{{ t('settings.account') }}</text>
    <view class="settings-page__card card">
      <view class="settings-page__row" @click="goTo('/pages/sessions/index')">
        <text class="settings-page__row-icon">📱</text>
        <text class="settings-page__row-label">{{ t('settings.loginDevices') }}</text>
        <text class="settings-page__row-arrow">›</text>
      </view>
      <view class="settings-page__divider" />
      <view class="settings-page__row settings-page__row--danger" @click="handleLogout">
        <text class="settings-page__row-icon">🚪</text>
        <text class="settings-page__row-label">{{ t('settings.signOut') }}</text>
      </view>
    </view>

    <!-- Legal -->
    <text class="settings-page__section">{{ t('settings.legal') }}</text>
    <view class="settings-page__card card">
      <view class="settings-page__row" @click="goTo('/pages/privacy/index')">
        <text class="settings-page__row-icon">🔒</text>
        <text class="settings-page__row-label">{{ t('settings.privacyPolicy') }}</text>
        <text class="settings-page__row-arrow">›</text>
      </view>
      <view class="settings-page__divider" />
      <view class="settings-page__row" @click="goTo('/pages/terms/index')">
        <text class="settings-page__row-icon">📄</text>
        <text class="settings-page__row-label">{{ t('settings.terms') }}</text>
        <text class="settings-page__row-arrow">›</text>
      </view>
    </view>

    <!-- App Info -->
    <text class="settings-page__section">{{ t('settings.appInfo') }}</text>
    <view class="settings-page__card card">
      <view class="settings-page__row">
        <text class="settings-page__row-icon">ℹ️</text>
        <text class="settings-page__row-label">{{ t('settings.version') }}</text>
        <text class="settings-page__row-value">v{{ appVersion }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { computed, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useThemeStore, type ThemeMode } from '../../stores/theme-store'
import { useAuthStore } from '../../stores/auth-store'
import { useI18nStore } from '../../stores/i18n-store'
import { useI18n } from '../../composables/useI18n'
import type { Locale } from '../../i18n/types'

const themeStore = useThemeStore()
const { themeMode } = storeToRefs(themeStore)
const authStore = useAuthStore()
const i18n = useI18nStore()
const { t } = useI18n()
const appVersion = ref('1.0.0')

const isH5 = process.env.TARO_ENV === 'h5'
// MINI-2：构建时注入微信订阅消息模板 id（需与后端 WECHAT_REMIND_TEMPLATE_ID 一致）
const WECHAT_REMIND_TEMPLATE_ID = process.env.TARO_APP_WX_TEMPLATE_ID || ''

const themeOptions = computed<{ label: string; value: ThemeMode; icon: string }[]>(() => [
  { label: t('settings.themeLight'), value: 'light', icon: '☀️' },
  { label: t('settings.themeDark'), value: 'dark', icon: '🌙' },
  { label: t('settings.themeSystem'), value: 'system', icon: '⚙️' },
])

const languageOptions: { label: string; value: Locale }[] = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
]

function goTo(url: string) {
  Taro.navigateTo({ url })
}

/** MINI-2：小程序订阅消息授权（事件提醒），须由用户点击手势触发 */
async function handleEnableWechatReminder() {
  if (isH5) {
    Taro.showToast({ title: t('settings.wechatReminderH5Only'), icon: 'none' })
    return
  }
  if (!WECHAT_REMIND_TEMPLATE_ID) {
    Taro.showToast({ title: t('settings.wechatReminderNotConfigured'), icon: 'none' })
    return
  }
  try {
    const res = await Taro.requestSubscribeMessage({ tmplIds: [WECHAT_REMIND_TEMPLATE_ID] })
    const state = res[WECHAT_REMIND_TEMPLATE_ID]
    if (state === 'accept') {
      Taro.showToast({ title: t('settings.wechatReminderEnabled'), icon: 'success' })
    } else {
      Taro.showToast({ title: t('settings.wechatReminderDeclined'), icon: 'none' })
    }
  } catch (err: any) {
    Taro.showToast({ title: err?.errMsg || t('settings.wechatReminderFailed'), icon: 'none' })
  }
}

function handleLogout() {
  Taro.showModal({
    title: t('settings.signOut'),
    content: t('settings.signOutConfirm'),
    success: async (res) => {
      if (res.confirm) {
        await authStore.logout()
        Taro.redirectTo({ url: '/pages/login/index' })
      }
    },
  })
}
</script>


<template>
  <view class="splash">
    <view class="splash__content">
      <view class="splash__icon">
        <text class="splash__icon-text">A</text>
      </view>
      <text class="splash__title">{{ t('splash.title') }}</text>
      <view class="splash__loader" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../../stores/auth-store'
import { useI18n } from '../../composables/useI18n'

const store = useAuthStore()
const { status } = storeToRefs(store)
const { t } = useI18n()

let timer: ReturnType<typeof setTimeout> | null = null

// 对应原 React useEffect(..., [status])：登录状态变化后延迟跳转，跳转前重置计时器
function scheduleNavigation() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (status.value === 'authenticated') {
      Taro.redirectTo({ url: '/pages/dashboard/index' })
    } else {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  }, 800)
}

watch(status, scheduleNavigation, { immediate: true })

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style src="./index.scss" scoped></style>

<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="login">
    <view class="login__content">
      <view class="login__header">
        <view class="login__icon">
          <text class="login__icon-text">A</text>
        </view>
        <text class="login__title">App</text>
        <text class="login__subtitle">Sign in to continue</text>
      </view>

      <view v-if="errorMessage" class="login__error">
        <text class="login__error-text">{{ errorMessage }}</text>
      </view>

      <view class="login__form">
        <view class="form-group">
          <text class="form-label">Username</text>
          <input
            class="form-input"
            :class="{ 'form-input--error': errors.username }"
            placeholder="Enter your username"
            v-model="username"
          />
          <text v-if="errors.username" class="form-error">{{ errors.username }}</text>
        </view>

        <view class="form-group">
          <text class="form-label">Password</text>
          <view class="password-input">
            <input
              class="form-input"
              :class="{ 'form-input--error': errors.password }"
              placeholder="Enter your password"
              :password="!showPassword"
              v-model="password"
            />
            <text class="password-toggle" @click="showPassword = !showPassword">
              {{ showPassword ? 'Hide' : 'Show' }}
            </text>
          </view>
          <text v-if="errors.password" class="form-error">{{ errors.password }}</text>
        </view>

        <button
          class="login__button"
          :loading="isLoading"
          :disabled="isLoading"
          @click="handleSubmit"
        >
          Sign In
        </button>

        <view v-if="!isH5" class="login__divider"><text class="login__divider-text">or</text></view>
        <button
          v-if="!isH5"
          class="login__button login__button--wechat"
          :loading="isLoading"
          :disabled="isLoading"
          @click="handleWechatLogin"
        >
          WeChat Login
        </button>

        <view class="login__footer">
          <text class="login__footer-text">Don't have an account? </text>
          <text class="login__footer-link" @click="goRegister">Register</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { ref, computed } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../../stores/auth-store'
import { validateUsername, validateRequired } from '../../utils/validators'

const store = useAuthStore()
const { status, errorMessage } = storeToRefs(store)
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const errors = ref<{ username?: string; password?: string }>({})

const isLoading = computed(() => status.value === 'loading')
const isH5 = process.env.TARO_ENV === 'h5'

async function handleSubmit() {
  const usernameErr = validateUsername(username.value)
  const passwordErr = validateRequired(password.value, 'Password')
  errors.value = { username: usernameErr || undefined, password: passwordErr || undefined }

  if (usernameErr || passwordErr) return

  const success = await store.login(username.value.trim(), password.value)
  if (success) {
    Taro.redirectTo({ url: '/pages/dashboard/index' })
  }
}

async function handleWechatLogin() {
  const success = await store.wechatLogin()
  if (success) {
    Taro.redirectTo({ url: '/pages/dashboard/index' })
  }
}

function goRegister() {
  Taro.navigateTo({ url: '/pages/register/index' })
}
</script>


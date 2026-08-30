<template>
  <view class="register">
    <view class="register__content">
      <view class="register__header">
        <view class="register__icon">
          <text class="register__icon-text">A</text>
        </view>
        <text class="register__title">Create Account</text>
        <text class="register__subtitle">Join App today</text>
      </view>

      <view v-if="errorMessage" class="register__error">
        <text class="register__error-text">{{ errorMessage }}</text>
      </view>

      <view class="register__form">
        <view class="form-group">
          <text class="form-label">Username</text>
          <input
            class="form-input"
            :class="{ 'form-input--error': errors.username }"
            placeholder="Choose a username"
            v-model="username"
          />
          <text v-if="errors.username" class="form-error">{{ errors.username }}</text>
        </view>

        <view class="form-group">
          <text class="form-label">Nickname</text>
          <input
            class="form-input"
            :class="{ 'form-input--error': errors.nickname }"
            placeholder="Your display name"
            v-model="nickname"
          />
          <text v-if="errors.nickname" class="form-error">{{ errors.nickname }}</text>
        </view>

        <view class="form-group">
          <text class="form-label">Password</text>
          <view class="password-input">
            <input
              class="form-input"
              :class="{ 'form-input--error': errors.password }"
              placeholder="At least 8 characters"
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
          class="register__button"
          :loading="isLoading"
          :disabled="isLoading"
          @click="handleSubmit"
        >
          Create Account
        </button>

        <view class="register__footer">
          <text class="register__footer-text">Already have an account? </text>
          <text class="register__footer-link" @click="goBack">Sign In</text>
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
import { validateUsername, validatePassword, validateNickname } from '../../utils/validators'

const store = useAuthStore()
const { status, errorMessage } = storeToRefs(store)
const username = ref('')
const password = ref('')
const nickname = ref('')
const showPassword = ref(false)
const errors = ref<Record<string, string>>({})

const isLoading = computed(() => status.value === 'loading')

async function handleSubmit() {
  const usernameErr = validateUsername(username.value)
  const passwordErr = validatePassword(password.value)
  const nicknameErr = validateNickname(nickname.value)
  errors.value = {
    username: usernameErr || '',
    password: passwordErr || '',
    nickname: nicknameErr || '',
  }

  if (usernameErr || passwordErr || nicknameErr) return

  const success = await store.register(
    username.value.trim(),
    password.value,
    nickname.value.trim(),
  )
  if (success) {
    Taro.redirectTo({ url: '/pages/dashboard/index' })
  }
}

function goBack() {
  Taro.navigateBack()
}
</script>


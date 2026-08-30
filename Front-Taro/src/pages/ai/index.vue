<template>
  <view class="ai-page">
    <view class="ai-page__header">
      <text class="ai-page__title">{{ t('aiChat.title') }}</text>
      <view class="ai-page__actions">
        <text class="ai-page__history" @click="goHistory">{{ t('aiChat.history') }}</text>
        <text v-if="messages.length > 0" class="ai-page__clear" @click="handleClear">{{ t('aiChat.clear') }}</text>
      </view>
    </view>

    <scroll-view class="ai-page__messages" scroll-y :scroll-into-view="scrollTarget">
      <view v-if="messages.length === 0" class="ai-page__empty">
        <text>{{ t('aiChat.welcomeHint') }}</text>
      </view>
      <view
        v-for="(m, i) in messages"
        :key="i"
        :id="`msg-${i}`"
        class="ai-page__bubble"
        :class="`ai-page__bubble--${m.role}`"
      >
        <text class="ai-page__bubble-text" user-select>{{ m.content }}</text>
      </view>
      <view v-if="store.isLoading" class="ai-page__bubble ai-page__bubble--assistant">
        <text>{{ t('aiChat.thinking') }}</text>
      </view>
      <view v-if="store.error && !store.isLoading" class="ai-page__error">
        <text>{{ store.error }}</text>
      </view>
    </scroll-view>

    <view class="ai-page__input-bar">
      <input
        class="ai-page__input"
        v-model="input"
        :placeholder="t('aiChat.placeholder')"
        confirm-type="send"
        @confirm="handleSend"
      />
      <button class="ai-page__send" size="mini" @click="handleSend" :disabled="store.isLoading">
        {{ t('aiChat.send') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import Taro from '@tarojs/taro'
import { useAiStore } from '../../stores/ai-store'
import { useI18n } from '../../composables/useI18n'

const store = useAiStore()
const { messages } = storeToRefs(store)
const { t } = useI18n()
const input = ref('')

const scrollTarget = computed(() => {
  const len = messages.value.length
  return len ? `msg-${len - 1}` : undefined
})

function handleSend() {
  const text = input.value.trim()
  if (!text || store.isLoading) return
  input.value = ''
  store.send(text)
}

function handleClear() {
  Taro.showModal({
    title: t('aiChat.clearTitle'),
    content: t('aiChat.clearConfirm'),
    success: (res) => {
      if (res.confirm) store.clear()
    },
  })
}

function goHistory() {
  Taro.navigateTo({ url: '/pages/ai-history/index' })
}
</script>


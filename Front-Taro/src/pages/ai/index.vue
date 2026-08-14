<template>
  <view class="ai-page">
    <view class="ai-page__header">
      <text class="ai-page__title">AI 助手</text>
      <view class="ai-page__actions">
        <text class="ai-page__history" @click="goHistory">历史</text>
        <text v-if="messages.length > 0" class="ai-page__clear" @click="handleClear">清空</text>
      </view>
    </view>

    <scroll-view class="ai-page__messages" scroll-y :scroll-into-view="scrollTarget">
      <view v-if="messages.length === 0" class="ai-page__empty">
        <text>有什么可以帮你？试试「查一下我今天的事件」</text>
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
        <text>思考中…</text>
      </view>
      <view v-if="store.error && !store.isLoading" class="ai-page__error">
        <text>{{ store.error }}</text>
      </view>
    </scroll-view>

    <view class="ai-page__input-bar">
      <input
        class="ai-page__input"
        v-model="input"
        placeholder="输入消息…"
        confirm-type="send"
        @confirm="handleSend"
      />
      <button class="ai-page__send" size="mini" @click="handleSend" :disabled="store.isLoading">
        发送
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import Taro from '@tarojs/taro'
import { useAiStore } from '../../stores/ai-store'

const store = useAiStore()
const { messages } = storeToRefs(store)
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
    title: '清空对话',
    content: '确定清空当前对话？',
    success: (res) => {
      if (res.confirm) store.clear()
    },
  })
}

function goHistory() {
  Taro.navigateTo({ url: '/pages/ai-history/index' })
}
</script>

<style src="./index.scss" scoped></style>

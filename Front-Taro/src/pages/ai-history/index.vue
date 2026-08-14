<template>
  <view class="ai-history-page">
    <view class="ai-history-page__header">
      <text class="ai-history-page__title">对话历史</text>
      <text class="ai-history-page__new" @click="goBack">新对话</text>
    </view>

    <text v-if="historyLoading" class="ai-history-page__hint">加载中…</text>
    <text v-if="historyError" class="ai-history-page__error">{{ historyError }}</text>

    <view v-if="!historyLoading && history.length === 0" class="ai-history-page__empty">
      <text>暂无历史对话</text>
    </view>

    <view
      v-for="c in history"
      :key="c.id"
      class="ai-history-page__item"
      @click="handleOpen(c.id)"
    >
      <view class="ai-history-page__content">
        <text class="ai-history-page__preview">{{ c.previewTitle }}</text>
        <text class="ai-history-page__meta">
          {{ fmt(c.lastActivityAt) }}{{ c.model ? ` · ${c.model}` : '' }}
        </text>
      </view>
      <text class="ai-history-page__delete" @click.stop="handleDelete(c)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import Taro from '@tarojs/taro'
import { useAiStore } from '../../stores/ai-store'

const store = useAiStore()
const { history, historyLoading, historyError } = storeToRefs(store)

onMounted(() => {
  store.loadHistory()
})

function handleOpen(id: string) {
  store.openConversation(id)
  Taro.navigateBack()
}

function handleDelete(item: { id: string; previewTitle: string }) {
  Taro.showModal({
    title: '删除对话',
    content: `确定删除「${item.previewTitle}」？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.deleteConversation(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
      }
    },
  })
}

function goBack() {
  Taro.navigateBack()
}

function fmt(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style src="./index.scss" scoped></style>

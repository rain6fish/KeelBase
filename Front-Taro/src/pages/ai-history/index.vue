<template>
  <view class="ai-history-page">
    <view class="ai-history-page__header">
      <text class="ai-history-page__title">{{ t('aiHistory.title') }}</text>
      <text class="ai-history-page__new" @click="goBack">{{ t('aiHistory.newConversation') }}</text>
    </view>

    <text v-if="historyLoading" class="ai-history-page__hint">{{ t('common.loading') }}</text>
    <text v-if="historyError" class="ai-history-page__error">{{ historyError }}</text>

    <view v-if="!historyLoading && history.length === 0" class="ai-history-page__empty">
      <text>{{ t('aiHistory.empty') }}</text>
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
import { useI18n } from '../../composables/useI18n'
import './index.scss'

const store = useAiStore()
const { history, historyLoading, historyError } = storeToRefs(store)
const { t } = useI18n()

onMounted(() => {
  store.loadHistory()
})

function handleOpen(id: string) {
  store.openConversation(id)
  Taro.navigateBack()
}

function handleDelete(item: { id: string; previewTitle: string }) {
  Taro.showModal({
    title: t('aiHistory.deleteTitle'),
    content: t('common.deleteConfirm', { name: item.previewTitle }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.deleteConversation(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('aiHistory.deleteFailed'), icon: 'none' })
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


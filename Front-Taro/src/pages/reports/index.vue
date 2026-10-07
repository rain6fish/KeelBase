<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="reports-page">
    <view class="reports-page__header">
      <text class="reports-page__title">{{ t('reports.title') }}</text>
      <text class="reports-page__count">{{ t('reports.count', { total: items.length }) }}</text>
    </view>

    <view class="reports-page__input-bar">
      <input
        class="reports-page__input"
        v-model="title"
        :placeholder="t('reports.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="reports-page__add" size="mini" @click="handleAdd">{{ t('reports.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="reports-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="reports-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="reports-page__empty">
      <text>{{ t('reports.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="reports-page__item">
      <text class="reports-page__text">{{ item.title }}</text>
      <text class="reports-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useReportsStore } from '../../stores/reports-store'
import { useI18n } from '../../composables/useI18n'

const store = useReportsStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: t('reports.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ title: text } as any)
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('reports.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('reports.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.title}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('reports.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

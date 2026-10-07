<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="books-page">
    <view class="books-page__header">
      <text class="books-page__title">{{ t('books.title') }}</text>
      <text class="books-page__count">{{ t('books.count', { total: items.length }) }}</text>
    </view>

    <view class="books-page__input-bar">
      <input
        class="books-page__input"
        v-model="title"
        :placeholder="t('books.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="books-page__add" size="mini" @click="handleAdd">{{ t('books.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="books-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="books-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="books-page__empty">
      <text>{{ t('books.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="books-page__item">
      <text class="books-page__text">{{ item.title }}</text>
      <text class="books-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useBooksStore } from '../../stores/books-store'
import { useI18n } from '../../composables/useI18n'

const store = useBooksStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: t('books.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ title: text } as any)
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('books.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('books.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.title}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('books.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

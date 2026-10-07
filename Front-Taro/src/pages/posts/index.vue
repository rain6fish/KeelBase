<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="posts-page">
    <view class="posts-page__header">
      <text class="posts-page__title">{{ t('posts.title') }}</text>
      <text class="posts-page__count">{{ t('posts.count', { total: items.length }) }}</text>
    </view>

    <view class="posts-page__input-bar">
      <input
        class="posts-page__input"
        v-model="title"
        :placeholder="t('posts.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="posts-page__add" size="mini" @click="handleAdd">{{ t('posts.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="posts-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="posts-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="posts-page__empty">
      <text>{{ t('posts.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="posts-page__item">
      <text class="posts-page__text">{{ item.title }}</text>
      <text class="posts-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { usePostsStore } from '../../stores/posts-store'
import { useI18n } from '../../composables/useI18n'

const store = usePostsStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: t('posts.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ title: text } as any)
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('posts.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('posts.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.title}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('posts.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

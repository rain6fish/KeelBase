<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="books-page">
    <view class="books-page__header">
      <text class="books-page__title">图书</text>
      <text class="books-page__count">{{ items.length }} 条</text>
    </view>

    <view class="books-page__input-bar">
      <input
        class="books-page__input"
        v-model="title"
        placeholder="新增图书…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="books-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="books-page__hint">加载中…</text>
    <text v-if="store.error" class="books-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="books-page__empty">
      <text>暂无图书</text>
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

const store = useBooksStore()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入图书内容', icon: 'none' })
    return
  }
  try {
    await store.add({ title: text } as any)
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: '删除图书',
    content: `确定删除「${item.title}」？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
      }
    },
  })
}
</script>

<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="posts-page">
    <view class="posts-page__header">
      <text class="posts-page__title">帖子</text>
      <text class="posts-page__count">{{ items.length }} 条</text>
    </view>

    <view class="posts-page__input-bar">
      <input
        class="posts-page__input"
        v-model="title"
        placeholder="新增帖子…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="posts-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="posts-page__hint">加载中…</text>
    <text v-if="store.error" class="posts-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="posts-page__empty">
      <text>暂无帖子</text>
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

const store = usePostsStore()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入帖子内容', icon: 'none' })
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
    title: '删除帖子',
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

<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="reports-page">
    <view class="reports-page__header">
      <text class="reports-page__title">报告</text>
      <text class="reports-page__count">{{ items.length }} 条</text>
    </view>

    <view class="reports-page__input-bar">
      <input
        class="reports-page__input"
        v-model="title"
        placeholder="新增报告…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="reports-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="reports-page__hint">加载中…</text>
    <text v-if="store.error" class="reports-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="reports-page__empty">
      <text>暂无报告</text>
    </view>
    <view v-for="item in items" :key="item.id" class="reports-page__item">
      <text class="reports-page__text">{{ item.title }}</text>
      <text class="reports-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useReportsStore } from '../../stores/reports-store'

const store = useReportsStore()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入报告内容', icon: 'none' })
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
    title: '删除报告',
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

<style src="./index.scss" scoped></style>

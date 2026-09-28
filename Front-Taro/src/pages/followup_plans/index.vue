<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="followup_plans-page">
    <view class="followup_plans-page__header">
      <text class="followup_plans-page__title">跟进计划</text>
      <text class="followup_plans-page__count">{{ items.length }} 条</text>
    </view>

    <view class="followup_plans-page__input-bar">
      <input
        class="followup_plans-page__input"
        v-model="title"
        placeholder="新增跟进计划…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="followup_plans-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="followup_plans-page__hint">加载中…</text>
    <text v-if="store.error" class="followup_plans-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="followup_plans-page__empty">
      <text>暂无跟进计划</text>
    </view>
    <view v-for="item in items" :key="item.id" class="followup_plans-page__item">
      <text class="followup_plans-page__text">{{ item.title }}</text>
      <text class="followup_plans-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useFollowupPlansStore } from '../../stores/followup_plans-store'

const store = useFollowupPlansStore()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入跟进计划内容', icon: 'none' })
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
    title: '删除跟进计划',
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


<template>
  <view class="contracts-page">
    <view class="contracts-page__header">
      <text class="contracts-page__title">合同</text>
      <text class="contracts-page__count">{{ items.length }} 条</text>
    </view>

    <view class="contracts-page__input-bar">
      <input
        class="contracts-page__input"
        v-model="name"
        placeholder="新增合同…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="contracts-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="contracts-page__hint">加载中…</text>
    <text v-if="store.error" class="contracts-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="contracts-page__empty">
      <text>暂无合同</text>
    </view>
    <view v-for="item in items" :key="item.id" class="contracts-page__item">
      <text class="contracts-page__text">{{ item.name }}</text>
      <text class="contracts-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useContractsStore } from '../../stores/contracts-store'

const store = useContractsStore()
const { items } = storeToRefs(store)
const name = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = name.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入合同内容', icon: 'none' })
    return
  }
  try {
    await store.add({ name: text } as any)
    name.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: '删除合同',
    content: `确定删除「${item.name}」？`,
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

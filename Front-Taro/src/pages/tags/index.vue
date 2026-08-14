<template>
  <view class="tags-page">
    <view class="tags-page__header">
      <text class="tags-page__title">标签</text>
      <text class="tags-page__count">{{ items.length }} 条</text>
    </view>

    <view class="tags-page__input-bar">
      <input
        class="tags-page__input"
        v-model="name"
        placeholder="新增标签…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="tags-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="tags-page__hint">加载中…</text>
    <text v-if="store.error" class="tags-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="tags-page__empty">
      <text>暂无标签</text>
    </view>
    <view v-for="item in items" :key="item.id" class="tags-page__item">
      <text class="tags-page__text">{{ item.name }}</text>
      <text class="tags-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useTagsStore } from '../../stores/tags-store'

const store = useTagsStore()
const { items } = storeToRefs(store)
const name = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = name.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入标签内容', icon: 'none' })
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
    title: '删除标签',
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

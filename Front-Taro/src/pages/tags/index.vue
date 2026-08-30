<template>
  <view class="tags-page">
    <view class="tags-page__header">
      <text class="tags-page__title">{{ t('tags.title') }}</text>
      <text class="tags-page__count">{{ t('tags.count', { total: items.length }) }}</text>
    </view>

    <view class="tags-page__input-bar">
      <input
        class="tags-page__input"
        v-model="name"
        :placeholder="t('tags.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="tags-page__add" size="mini" @click="handleAdd">{{ t('tags.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="tags-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="tags-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="tags-page__empty">
      <text>{{ t('tags.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="tags-page__item">
      <text class="tags-page__text">{{ item.name }}</text>
      <text class="tags-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useTagsStore } from '../../stores/tags-store'
import { useI18n } from '../../composables/useI18n'

const store = useTagsStore()
const { items } = storeToRefs(store)
const { t } = useI18n()
const name = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = name.value.trim()
  if (!text) {
    Taro.showToast({ title: t('tags.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ name: text } as any)
    name.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('tags.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('tags.deleteTitle'),
    content: t('common.deleteConfirm', { name: item.name }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('tags.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>


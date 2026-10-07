<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="notes-page">
    <view class="notes-page__header">
      <text class="notes-page__title">{{ t('notes.title') }}</text>
      <text class="notes-page__count">{{ t('notes.count', { total: items.length }) }}</text>
    </view>

    <view class="notes-page__input-bar">
      <input
        class="notes-page__input"
        v-model="title"
        :placeholder="t('notes.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="notes-page__add" size="mini" @click="handleAdd">{{ t('notes.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="notes-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="notes-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="notes-page__empty">
      <text>{{ t('notes.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="notes-page__item">
      <text class="notes-page__text">{{ item.title }}</text>
      <text class="notes-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useNotesStore } from '../../stores/notes-store'
import { useI18n } from '../../composables/useI18n'

const store = useNotesStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: t('notes.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ title: text } as any)
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('notes.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('notes.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.title}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('notes.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

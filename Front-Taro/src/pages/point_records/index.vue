<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="point_records-page">
    <view class="point_records-page__header">
      <text class="point_records-page__title">{{ t('point_records.title') }}</text>
      <text class="point_records-page__count">{{ t('point_records.count', { total: items.length }) }}</text>
    </view>

    <view class="point_records-page__input-bar">
      <input
        class="point_records-page__input"
        v-model="points"
        :placeholder="t('point_records.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="point_records-page__add" size="mini" @click="handleAdd">{{ t('point_records.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="point_records-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="point_records-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="point_records-page__empty">
      <text>{{ t('point_records.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="point_records-page__item">
      <text class="point_records-page__text">{{ item.points }}</text>
      <text class="point_records-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { usePointRecordsStore } from '../../stores/point_records-store'
import { useI18n } from '../../composables/useI18n'

const store = usePointRecordsStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const points = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = points.value.trim()
  if (!text) {
    Taro.showToast({ title: t('point_records.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ points: text } as any)
    points.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('point_records.createFailed'), icon: 'none' })
  }
}


function handleRemove(item: any) {
  Taro.showModal({
    title: t('point_records.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.points}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('point_records.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

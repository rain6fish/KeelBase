<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="points_ledgers-page">
    <view class="points_ledgers-page__header">
      <text class="points_ledgers-page__title">{{ t('points_ledgers.title') }}</text>
      <text class="points_ledgers-page__count">{{ t('points_ledgers.count', { total: items.length }) }}</text>
    </view>

    <view class="points_ledgers-page__input-bar">
      <input
        class="points_ledgers-page__input"
        v-model="points"
        :placeholder="t('points_ledgers.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="points_ledgers-page__add" size="mini" @click="handleAdd">{{ t('points_ledgers.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="points_ledgers-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="points_ledgers-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="points_ledgers-page__empty">
      <text>{{ t('points_ledgers.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="points_ledgers-page__item">
      <text class="points_ledgers-page__text">{{ item.points }}</text>
      <text class="points_ledgers-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { usePointsLedgersStore } from '../../stores/points_ledgers-store'
import { useI18n } from '../../composables/useI18n'

const store = usePointsLedgersStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const points = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = points.value.trim()
  if (!text) {
    Taro.showToast({ title: t('points_ledgers.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ points: text } as any)
    points.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('points_ledgers.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('points_ledgers.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.points}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('points_ledgers.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

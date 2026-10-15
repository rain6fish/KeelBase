<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="asset_loans-page">
    <view class="asset_loans-page__header">
      <text class="asset_loans-page__title">{{ t('asset_loans.title') }}</text>
      <text class="asset_loans-page__count">{{ t('asset_loans.count', { total: items.length }) }}</text>
    </view>

    <view class="asset_loans-page__input-bar">
      <input
        class="asset_loans-page__input"
        v-model="assetName"
        :placeholder="t('asset_loans.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="asset_loans-page__add" size="mini" @click="handleAdd">{{ t('asset_loans.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="asset_loans-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="asset_loans-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="asset_loans-page__empty">
      <text>{{ t('asset_loans.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="asset_loans-page__item">
      <text class="asset_loans-page__text">{{ item.assetName }}</text>
      <text class="asset_loans-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useAssetLoansStore } from '../../stores/asset_loans-store'
import { useI18n } from '../../composables/useI18n'

const store = useAssetLoansStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const assetName = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = assetName.value.trim()
  if (!text) {
    Taro.showToast({ title: t('asset_loans.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ assetName: text } as any)
    assetName.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('asset_loans.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('asset_loans.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.assetName}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('asset_loans.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

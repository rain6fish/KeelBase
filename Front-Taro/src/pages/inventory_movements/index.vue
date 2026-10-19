<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="inventory_movements-page">
    <view class="inventory_movements-page__header">
      <text class="inventory_movements-page__title">{{ t('inventory_movements.title') }}</text>
      <text class="inventory_movements-page__count">{{ t('inventory_movements.count', { total: items.length }) }}</text>
    </view>

    <view class="inventory_movements-page__input-bar">
      <input
        class="inventory_movements-page__input"
        v-model="documentNo"
        :placeholder="t('inventory_movements.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="inventory_movements-page__add" size="mini" @click="handleAdd">{{ t('inventory_movements.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="inventory_movements-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="inventory_movements-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="inventory_movements-page__empty">
      <text>{{ t('inventory_movements.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="inventory_movements-page__item">
      <text class="inventory_movements-page__text">{{ item.documentNo }}</text>
      <text class="inventory_movements-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useInventoryMovementsStore } from '../../stores/inventory_movements-store'
import { useI18n } from '../../composables/useI18n'

const store = useInventoryMovementsStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const documentNo = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = documentNo.value.trim()
  if (!text) {
    Taro.showToast({ title: t('inventory_movements.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ documentNo: text } as any)
    documentNo.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('inventory_movements.createFailed'), icon: 'none' })
  }
}


function handleRemove(item: any) {
  Taro.showModal({
    title: t('inventory_movements.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.documentNo}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('inventory_movements.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

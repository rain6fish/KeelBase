<template>
  <view class="suppliers-page">
    <view class="suppliers-page__header">
      <text class="suppliers-page__title">{{ t('suppliers.title') }}</text>
      <text class="suppliers-page__count">{{ t('suppliers.count', { total: items.length }) }}</text>
    </view>

    <view class="suppliers-page__input-bar">
      <input
        class="suppliers-page__input"
        v-model="name"
        :placeholder="t('suppliers.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="suppliers-page__add" size="mini" @click="handleAdd">{{ t('suppliers.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="suppliers-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="suppliers-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="suppliers-page__empty">
      <text>{{ t('suppliers.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="suppliers-page__item">
      <text class="suppliers-page__text">{{ item.name }}</text>
      <text class="suppliers-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useSuppliersStore } from '../../stores/suppliers-store'
import { useI18n } from '../../composables/useI18n'

const store = useSuppliersStore()
const { items } = storeToRefs(store)
const { t } = useI18n()
const name = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = name.value.trim()
  if (!text) {
    Taro.showToast({ title: t('suppliers.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ name: text } as any)
    name.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('suppliers.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('suppliers.deleteTitle'),
    content: t('common.deleteConfirm', { name: item.name }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('suppliers.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>


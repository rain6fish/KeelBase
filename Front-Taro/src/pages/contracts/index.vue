<template>
  <view class="contracts-page">
    <view class="contracts-page__header">
      <text class="contracts-page__title">{{ t('contracts.title') }}</text>
      <text class="contracts-page__count">{{ t('contracts.count', { total: items.length }) }}</text>
    </view>

    <view class="contracts-page__input-bar">
      <input
        class="contracts-page__input"
        v-model="name"
        :placeholder="t('contracts.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="contracts-page__add" size="mini" @click="handleAdd">{{ t('contracts.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="contracts-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="contracts-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="contracts-page__empty">
      <text>{{ t('contracts.empty') }}</text>
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
import { useI18n } from '../../composables/useI18n'

const store = useContractsStore()
const { items } = storeToRefs(store)
const { t } = useI18n()
const name = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = name.value.trim()
  if (!text) {
    Taro.showToast({ title: t('contracts.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ name: text } as any)
    name.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('contracts.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('contracts.deleteTitle'),
    content: t('common.deleteConfirm', { name: item.name }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('contracts.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

<style src="./index.scss" scoped></style>

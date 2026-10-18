<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="followup_plans-page">
    <view class="followup_plans-page__header">
      <text class="followup_plans-page__title">{{ t('followup_plans.title') }}</text>
      <text class="followup_plans-page__count">{{ t('followup_plans.count', { total: items.length }) }}</text>
    </view>

    <view class="followup_plans-page__input-bar">
      <input
        class="followup_plans-page__input"
        v-model="title"
        :placeholder="t('followup_plans.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="followup_plans-page__add" size="mini" @click="handleAdd">{{ t('followup_plans.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="followup_plans-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="followup_plans-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="followup_plans-page__empty">
      <text>{{ t('followup_plans.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="followup_plans-page__item">
      <text class="followup_plans-page__text">{{ item.title }}</text>
      <text class="followup_plans-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useFollowupPlansStore } from '../../stores/followup_plans-store'
import { useI18n } from '../../composables/useI18n'

const store = useFollowupPlansStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const title = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: t('followup_plans.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ title: text } as any)
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('followup_plans.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('followup_plans.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.title}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('followup_plans.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>


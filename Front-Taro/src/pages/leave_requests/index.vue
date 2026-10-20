<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="leave_requests-page">
    <view class="leave_requests-page__header">
      <text class="leave_requests-page__title">{{ t('leave_requests.title') }}</text>
      <text class="leave_requests-page__count">{{ t('leave_requests.count', { total: items.length }) }}</text>
    </view>

    <view class="leave_requests-page__input-bar">
      <input
        class="leave_requests-page__input"
        v-model="requestNo"
        :placeholder="t('leave_requests.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="leave_requests-page__add" size="mini" @click="handleAdd">{{ t('leave_requests.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="leave_requests-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="leave_requests-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="leave_requests-page__empty">
      <text>{{ t('leave_requests.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="leave_requests-page__item">
      <text class="leave_requests-page__text">{{ item.requestNo }}</text>
      <text class="leave_requests-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useLeaveRequestsStore } from '../../stores/leave_requests-store'
import { useI18n } from '../../composables/useI18n'

const store = useLeaveRequestsStore()
const { t } = useI18n()
const { items } = storeToRefs(store)
const requestNo = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = requestNo.value.trim()
  if (!text) {
    Taro.showToast({ title: t('leave_requests.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ requestNo: text } as any)
    requestNo.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('leave_requests.createFailed'), icon: 'none' })
  }
}


function handleRemove(item: any) {
  Taro.showModal({
    title: t('leave_requests.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.requestNo}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('leave_requests.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

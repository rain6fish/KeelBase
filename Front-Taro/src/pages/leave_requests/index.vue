<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="leave_requests-page">
    <view class="leave_requests-page__header">
      <text class="leave_requests-page__title">{{ t('leave_requests.title') }}</text>
      <text class="leave_requests-page__count">{{ t('leave_requests.count', { total: items.length }) }}</text>
    </view>

    <view class="leave_requests-page__form">
      <input
        class="leave_requests-page__input"
        v-model="requestNo"
        :placeholder="t('leave_requests.fieldRequestNo')"
        confirm-type="next"
      />

      <picker
        mode="selector"
        :range="leaveTypeOptions"
        :value="leaveTypeIndex"
        @change="onLeaveTypeChange"
      >
        <view class="leave_requests-page__picker">
          {{ t('leave_requests.fieldLeaveType') }}: {{ leaveTypeLabel(leaveType) }}
        </view>
      </picker>

      <picker mode="date" :value="startDate" @change="onStartDateChange">
        <view class="leave_requests-page__picker">
          {{ t('leave_requests.fieldStartDate') }}: {{ startDate || 'YYYY-MM-DD' }}
        </view>
      </picker>

      <picker mode="date" :value="endDate" @change="onEndDateChange">
        <view class="leave_requests-page__picker">
          {{ t('leave_requests.fieldEndDate') }}: {{ endDate || 'YYYY-MM-DD' }}
        </view>
      </picker>

      <input
        class="leave_requests-page__input"
        v-model="days"
        type="number"
        :placeholder="t('leave_requests.fieldDays')"
      />

      <input
        class="leave_requests-page__input"
        v-model="reason"
        :placeholder="t('leave_requests.fieldReason')"
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
import type { CreateLeaveRequestRequest } from '../../types/leave_requests'

const store = useLeaveRequestsStore()
const { t } = useI18n()
const { items } = storeToRefs(store)

const requestNo = ref('')
const leaveTypeOptions = ['annual', 'sick', 'personal', 'other']
const leaveTypeIndex = ref(0)
const leaveType = ref(leaveTypeOptions[0])
const startDate = ref('')
const endDate = ref('')
const days = ref('')
const reason = ref('')

function leaveTypeLabel(value: string): string {
  const suffix = value.charAt(0).toUpperCase() + value.slice(1)
  return t(`leave_requests.leaveType${suffix}`)
}

function onLeaveTypeChange(e: any) {
  leaveTypeIndex.value = Number(e.detail.value)
  leaveType.value = leaveTypeOptions[leaveTypeIndex.value]
}

function onStartDateChange(e: any) {
  startDate.value = String(e.detail.value)
}

function onEndDateChange(e: any) {
  endDate.value = String(e.detail.value)
}

function resetForm() {
  requestNo.value = ''
  leaveTypeIndex.value = 0
  leaveType.value = leaveTypeOptions[0]
  startDate.value = ''
  endDate.value = ''
  days.value = ''
  reason.value = ''
}

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const requestNoValue = requestNo.value.trim()
  const daysValue = Number(days.value)
  // The server's DTO requires every one of these; sending a partial object is what made the add
  // button a guaranteed 400. Validate here so the failure is a clear toast, not a server error.
  // 服务端 DTO 要求这些字段全部存在；只发一部分正是「添加」必然 400 的原因。这里先校验，
  // 让失败表现为清楚的提示，而不是服务端报错。
  if (
    !requestNoValue ||
    !startDate.value ||
    !endDate.value ||
    !Number.isInteger(daysValue) ||
    daysValue <= 0
  ) {
    Taro.showToast({ title: t('leave_requests.formRequired'), icon: 'none' })
    return
  }
  if (endDate.value < startDate.value) {
    Taro.showToast({ title: t('leave_requests.dateOrder'), icon: 'none' })
    return
  }
  const dto: CreateLeaveRequestRequest = {
    requestNo: requestNoValue,
    leaveType: leaveType.value,
    startDate: startDate.value,
    endDate: endDate.value,
    days: daysValue,
    ...(reason.value.trim() ? { reason: reason.value.trim() } : {}),
  }
  try {
    await store.add(dto)
    resetForm()
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

<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="user-detail">
    <view v-if="loading" class="user-detail__loading">
      <view class="spinner" />
    </view>

    <view v-else-if="!user" class="user-detail__not-found">
      <text>{{ t('userDetail.notFound') }}</text>
    </view>

    <template v-else>
      <view class="user-detail__header">
        <view class="user-detail__avatar">
          <text class="user-detail__avatar-text">{{ avatarInitial }}</text>
        </view>
        <text class="user-detail__name">{{ user.nickname }}</text>
        <text class="user-detail__username">@{{ user.username }}</text>
      </view>

      <view class="user-detail__info card">
        <view v-for="row in infoRows" :key="row.label" class="info-row">
          <text class="info-row__label">{{ row.label }}</text>
          <text class="info-row__value">{{ row.value }}</text>
        </view>
        <view v-if="user.isLocked" class="user-detail__locked">
          <text>{{ t('userDetail.locked') }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { computed, onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { usersService } from '../../services/users-service'
import { useI18n } from '../../composables/useI18n'
import type { UserItem } from '../../types/user'
import { formatDateTime } from '../../utils/format'

const router = Taro.getCurrentInstance().router
const userId = Number(router?.params?.id || 0)
const user = ref<UserItem | null>(null)
const loading = ref(true)

const { t } = useI18n()

const avatarInitial = computed(() => user.value?.nickname?.[0]?.toUpperCase() || '?')

const infoRows = computed(() => {
  const u = user.value
  if (!u) return []
  const rows: { label: string; value: string }[] = [
    { label: 'ID', value: String(u.id) },
    { label: t('userDetail.username'), value: u.username },
    { label: t('userDetail.nickname'), value: u.nickname },
  ]
  if (u.createdAt) rows.push({ label: t('userDetail.created'), value: formatDateTime(u.createdAt) })
  if (u.updatedAt) rows.push({ label: t('userDetail.updated'), value: formatDateTime(u.updatedAt) })
  return rows
})

onMounted(() => {
  if (userId) {
    usersService
      .getUser(userId)
      .then((data) => {
        user.value = data
      })
      .catch(() => {})
      .finally(() => {
        loading.value = false
      })
  } else {
    loading.value = false
  }
})
</script>


<template>
  <view class="users-page">
    <view v-if="error && users.length === 0" class="users-page__error">
      <text class="users-page__error-text">{{ error }}</text>
      <button class="users-page__retry" @click="store.loadUsers(true)">Retry</button>
    </view>

    <view v-if="isLoading && users.length === 0" class="users-page__loading">
      <view class="spinner" />
    </view>
    <scroll-view
      v-else
      class="users-page__list"
      scroll-y
      :lower-threshold="200"
      @scrolltolower="handleScrollToLower"
    >
      <view
        v-for="user in users"
        :key="user.id"
        class="users-page__item card"
        @click="goToDetail(user.id)"
      >
        <view class="users-page__item-avatar">
          <text class="users-page__item-avatar-text">{{ avatarInitial(user) }}</text>
        </view>
        <view class="users-page__item-info">
          <text class="users-page__item-name">{{ user.nickname }}</text>
          <text class="users-page__item-username">@{{ user.username }}</text>
        </view>
        <text class="users-page__item-arrow">›</text>
      </view>
      <view v-if="isLoading && hasMore" class="users-page__list-loading">
        <view class="spinner" />
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import Taro from '@tarojs/taro'
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useUsersStore } from '../../stores/users-store'
import type { UserItem } from '../../types/user'

const store = useUsersStore()
const { users, isLoading, error, hasMore } = storeToRefs(store)

onMounted(() => {
  store.loadUsers(true)
})

const handleScrollToLower = () => {
  if (!isLoading.value && hasMore.value) {
    store.loadUsers()
  }
}

function avatarInitial(user: UserItem) {
  return user.nickname?.[0]?.toUpperCase() || '?'
}

function goToDetail(id: number) {
  Taro.navigateTo({ url: `/pages/user-detail/index?id=${id}` })
}
</script>

<style src="./index.scss" scoped></style>

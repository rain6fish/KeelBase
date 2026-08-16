<template>
  <view class="notifications-page">
    <view class="notifications-page__header">
      <text class="notifications-page__title">Notifications</text>
      <text v-if="notifications.length > 0" class="notifications-page__mark-all" @click="handleMarkAllRead">
        Mark All Read
      </text>
    </view>

    <view v-if="isLoading && notifications.length === 0" class="notifications-page__loading">
      <view class="spinner" />
    </view>
    <view v-else-if="notifications.length === 0" class="notifications-page__empty">
      <text class="notifications-page__empty-text">No notifications yet</text>
    </view>
    <scroll-view
      v-else
      class="notifications-page__list"
      scroll-y
      lower-threshold="80"
      @scrolltolower="handleLoadMore"
    >
      <view
        v-for="n in notifications"
        :key="n.id"
        class="notifications-page__item"
        :class="n.isRead ? '' : 'notifications-page__item--unread'"
        @click="handleTap(n)"
      >
        <view v-if="!n.isRead" class="notifications-page__dot" />
        <view class="notifications-page__content">
          <text class="notifications-page__title-text">{{ n.title }}</text>
          <text v-if="n.body" class="notifications-page__body">{{ n.body }}</text>
        </view>
        <view class="notifications-page__meta">
          <text class="notifications-page__time">{{ formatTime(n.createdAt) }}</text>
          <text class="notifications-page__delete" @click.stop="handleDelete(n.id)">✕</text>
        </view>
      </view>
      <view v-if="hasMore" class="notifications-page__list-loading">
        <text>Loading more...</text>
      </view>
    </scroll-view>

    <view v-if="unreadCount > 0" class="notifications-page__badge">
      <text>{{ unreadCount }} unread</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import Taro from '@tarojs/taro'
import { useNotificationStore } from '../../stores/notification-store'
import type { NotificationItem } from '../../types/notification'

const store = useNotificationStore()
const { notifications, unreadCount, isLoading, hasMore } = storeToRefs(store)

onMounted(() => {
  store.load(true)
  store.initRealtime()
})

function handleLoadMore() {
  if (hasMore.value && !isLoading.value) store.load()
}

function handleTap(n: NotificationItem) {
  if (!n.isRead) store.markRead(n.id)
}

function handleMarkAllRead() {
  Taro.showModal({
    title: 'Mark All Read',
    content: 'Mark all notifications as read?',
    success: (res) => {
      if (res.confirm) store.markAllRead()
    },
  })
}

function handleDelete(id: number) {
  Taro.showModal({
    title: 'Delete',
    content: 'Delete this notification?',
    success: (res) => {
      if (res.confirm) store.remove(id)
    },
  })
}

function formatTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style src="./index.scss" scoped></style>

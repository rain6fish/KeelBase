<template>
  <view class="events-page">
    <!-- Month navigation -->
    <view class="events-page__nav">
      <text class="events-page__nav-btn" @click="prevMonth">‹</text>
      <text class="events-page__nav-title">{{ formatMonthYear(currentMonth) }}</text>
      <text class="events-page__nav-btn" @click="nextMonth">›</text>
    </view>

    <view class="events-page__divider" />

    <!-- Error state -->
    <view v-if="store.error" class="events-page__error">
      <text class="events-page__error-text">{{ store.error }}</text>
      <button class="events-page__retry" @click="fetchEvents">Retry</button>
    </view>

    <!-- Event list -->
    <view v-if="store.isLoading && events.length === 0" class="events-page__loading">
      <view class="spinner" />
    </view>
    <view v-else-if="events.length === 0" class="events-page__empty">
      <text class="events-page__empty-text">No events this month</text>
    </view>
    <scroll-view
      v-else
      class="events-page__list"
      scroll-y
      refresher-enabled
      @refresherrefresh="fetchEvents"
    >
      <view v-for="event in events" :key="event.id" class="events-page__item card">
        <view class="events-page__item-color" :style="{ backgroundColor: colorOf(event) }" />
        <view class="events-page__item-info">
          <text class="events-page__item-title">{{ event.title }}</text>
          <text class="events-page__item-time">
            {{ formatShortDateTime(event.startTime) }} - {{ event.startTime.slice(11, 16) }}
          </text>
        </view>
        <text v-if="event.isCancelled" class="events-page__item-cancelled">✕</text>
      </view>
    </scroll-view>

    <!-- FAB -->
    <view class="events-page__fab" @click="handleAddEvent">
      <text class="events-page__fab-icon">+</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useEventsStore } from '../../stores/events-store'
import { EVENT_COLORS } from '../../utils/constants'
import { formatMonthYear, formatShortDateTime, formatDate } from '../../utils/format'
import type { EventItem } from '../../types/event'

const store = useEventsStore()
const { events } = storeToRefs(store)

const now = new Date()
const currentMonth = ref(new Date(now.getFullYear(), now.getMonth(), 1))

const fetchEvents = () => {
  const end = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 0)
  store.loadEvents(formatDate(currentMonth.value), formatDate(end))
}

onMounted(fetchEvents)
watch(currentMonth, fetchEvents)

function prevMonth() {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1, 1)
}

function nextMonth() {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 1)
}

function colorOf(event: EventItem): string {
  return EVENT_COLORS[event.colorRole] || EVENT_COLORS[0]
}

async function handleAddEvent() {
  await Taro.navigateTo({ url: '/pages/event-form/index' })
  fetchEvents()
}
</script>

<style src="./index.scss" scoped></style>

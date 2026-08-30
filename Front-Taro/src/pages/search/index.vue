<template>
  <view class="search-page">
    <view class="search-page__bar">
      <text class="search-page__icon">🔍</text>
      <input
        class="search-page__input"
        v-model="keyword"
        :placeholder="t('search.placeholder')"
        focus
      />
      <text v-if="keyword" class="search-page__clear" @click="keyword = ''">✕</text>
    </view>

    <scroll-view class="search-page__body" scroll-y>
      <text v-if="loading" class="search-page__hint">{{ t('search.searching') }}</text>

      <view
        v-if="!loading && searched && events.length === 0 && users.length === 0"
        class="search-page__empty"
      >
        <text>{{ t('search.empty') }}</text>
      </view>

      <template v-if="!loading && events.length > 0">
        <text class="search-page__section">{{ t('search.eventsSection', { count: events.length }) }}</text>
        <view v-for="e in events" :key="e.id" class="search-page__card" @click="goEvent(e.id)">
          <view class="search-page__color" :style="{ backgroundColor: colorOf(e) }" />
          <view class="search-page__card-main">
            <text class="search-page__card-title">{{ e.title }}</text>
            <text class="search-page__card-sub">
              {{ fmt(e.startTime) }}{{ e.location ? ' · ' + e.location : '' }}
            </text>
          </view>
        </view>
      </template>

      <template v-if="!loading && users.length > 0">
        <text class="search-page__section">{{ t('search.usersSection', { count: users.length }) }}</text>
        <view v-for="u in users" :key="u.id" class="search-page__card" @click="goUser(u.id)">
          <text class="search-page__avatar">{{ (u.nickname || u.username).charAt(0).toUpperCase() }}</text>
          <view class="search-page__card-main">
            <text class="search-page__card-title">{{ u.nickname || u.username }}</text>
            <text class="search-page__card-sub">@{{ u.username }}</text>
          </view>
        </view>
      </template>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { ref, watch } from 'vue'
import Taro from '@tarojs/taro'
import { searchService } from '../../services/search-service'
import { useI18n } from '../../composables/useI18n'
import { EVENT_COLORS } from '../../utils/constants'
import type { EventItem } from '../../types/event'
import type { UserItem } from '../../types/user'

const { t } = useI18n()

/** 全局搜索页（DX-3）：复用 /search 聚合本人事件 + 公开用户。 */
const keyword = ref('')
const events = ref<EventItem[]>([])
const users = ref<UserItem[]>([])
const loading = ref(false)
const searched = ref(false)

async function run() {
  const q = keyword.value.trim()
  if (!q) {
    events.value = []
    users.value = []
    searched.value = false
    return
  }
  const seq = ++searchSeq
  loading.value = true
  try {
    const res = await searchService.search(q)
    if (seq !== searchSeq) return // 过期响应丢弃，防慢响应覆盖新结果
    events.value = res.events.items
    users.value = res.users.items
  } catch (err: any) {
    if (seq !== searchSeq) return
    Taro.showToast({ title: err.message || t('search.failed'), icon: 'none' })
  } finally {
    if (seq === searchSeq) {
      loading.value = false
      searched.value = true
    }
  }
}

let searchSeq = 0

let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(run, 400)
})

function goEvent(id: number) {
  Taro.navigateTo({ url: `/pages/event-form/index?id=${id}` })
}

function goUser(id: number) {
  Taro.navigateTo({ url: `/pages/user-detail/index?id=${id}` })
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '')

function colorOf(e: EventItem): string {
  return EVENT_COLORS[e.colorRole] || EVENT_COLORS[0]
}
</script>


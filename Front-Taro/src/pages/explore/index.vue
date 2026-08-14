<template>
  <view class="explore-page">
    <!-- Search bar → 搜索页（DX-3） -->
    <view class="explore-page__search" @click="goSearch">
      <text class="explore-page__search-icon">🔍</text>
      <text class="explore-page__search-input">搜索事件、用户…</text>
    </view>

    <!-- Quick Access -->
    <text class="explore-page__section-title">Quick Access</text>
    <view class="explore-page__grid">
      <view
        v-for="card in quickCards"
        :key="card.label"
        class="explore-page__card"
        :style="{ backgroundColor: `${card.color}15` }"
        @click="goTo(card.path)"
      >
        <text class="explore-page__card-icon">{{ card.icon }}</text>
        <text class="explore-page__card-label" :style="{ color: card.color }">{{ card.label }}</text>
      </view>
    </view>

    <!-- Recent Activity -->
    <text class="explore-page__section-title">Recent Activity</text>
    <view class="explore-page__empty">
      <text class="explore-page__empty-icon">🔭</text>
      <text class="explore-page__empty-text">Discover new features coming soon!</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import Taro from '@tarojs/taro'

const quickCards = [
  { icon: '🤖', label: 'AI', color: '#007AFF', path: '/pages/ai/index' },
  { icon: '📤', label: 'Upload', color: '#16A34A', path: '/pages/upload/index' },
  { icon: '📅', label: 'Events', color: '#F59E0B', path: '/pages/events/index' },
  { icon: '✅', label: 'Todos', color: '#8B5CF6', path: '/pages/todos/index' },
  { icon: '📋', label: 'AI 历史', color: '#0EA5E9', path: '/pages/ai-history/index' },
  { icon: '⚙️', label: 'Settings', color: '#9333EA', path: '/pages/settings/index' },
]

function goSearch() {
  Taro.navigateTo({ url: '/pages/search/index' })
}

function goTo(path: string) {
  Taro.navigateTo({ url: path })
}
</script>

<style src="./index.scss" scoped></style>

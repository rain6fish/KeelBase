<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="explore-page">
    <!-- Search bar → 搜索页（DX-3） -->
    <view class="explore-page__search" @click="goSearch">
      <text class="explore-page__search-icon">🔍</text>
      <text class="explore-page__search-input">{{ t('explore.searchPlaceholder') }}</text>
    </view>

    <!-- Quick Access -->
    <text class="explore-page__section-title">{{ t('explore.quickAccess') }}</text>
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
    <text class="explore-page__section-title">{{ t('explore.recentActivity') }}</text>
    <view class="explore-page__empty">
      <text class="explore-page__empty-icon">🔭</text>
      <text class="explore-page__empty-text">{{ t('explore.discoverSoon') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { computed, onMounted } from 'vue'
import Taro from '@tarojs/taro'
import { useI18n } from '../../composables/useI18n'
import { useCapabilitiesStore } from '../../stores/capabilities-store'

const { t } = useI18n()
const caps = useCapabilitiesStore()

// FE-1/MOD-4：带 module 的卡片按 /app/capabilities 过滤（未加载/失败 → 全显）
const quickCards = computed(() =>
  [
    { icon: '🤖', label: t('explore.ai'), color: '#007AFF', path: '/pages/ai/index' },
    { icon: '📤', label: t('explore.upload'), color: '#16A34A', path: '/pages/upload/index' },
    { icon: '📅', label: t('explore.events'), color: '#F59E0B', path: '/pages/events/index', module: 'events' },
    { icon: '✅', label: t('explore.todos'), color: '#8B5CF6', path: '/pages/todos/index', module: 'todos' },
    { icon: '📋', label: t('explore.aiHistory'), color: '#0EA5E9', path: '/pages/ai-history/index' },
    { icon: '⚙️', label: t('explore.settings'), color: '#9333EA', path: '/pages/settings/index' },
    { icon: '📦', label: t('explore.contracts'), color: '#F97316', path: '/pages/contracts/index', module: 'contracts' },
    { icon: '📦', label: t('explore.suppliers'), color: '#F97316', path: '/pages/suppliers/index', module: 'suppliers' },
    { icon: '📦', label: t('explore.tags'), color: '#F97316', path: '/pages/tags/index', module: 'tags' },
  ].filter((c: { module?: string }) => !c.module || caps.isModuleEnabled(c.module)),
)

onMounted(() => {
  void caps.load()
})

function goSearch() {
  Taro.navigateTo({ url: '/pages/search/index' })
}

function goTo(path: string) {
  Taro.navigateTo({ url: path })
}
</script>


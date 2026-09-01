<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div v-loading="loading">
    <PageHeader :title="t('navWorkbench')" :subtitle="t('workbenchSubtitle')" />

    <!-- 首启引导（P0-6）：非 full 预设提示用户「为何部分功能缺失」 -->
    <el-alert
      v-if="presetName && presetName !== 'full'"
      :title="t('presetHintTitle', { preset: presetName })"
      type="info"
      :closable="false"
      class="mb-4"
    >
      <div class="text-caption">{{ presetDescription }}</div>
    </el-alert>

    <el-row :gutter="16">
      <el-col v-for="card in infoCards" :key="card.label" :xs="24" :sm="12" :md="6">
        <StatCard v-bind="card" />
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col v-for="card in shortcutCards" :key="card.title" :xs="24" :sm="12" :md="8">
        <el-card
          class="h-100 shortcut-card"
          shadow="hover"
          @click="openCard(card)"
        >
          <div class="d-flex align-center ga-2">
            <AppIcon :icon="card.icon" size="22" color="var(--el-color-primary)" />
            <span class="text-h6">{{ card.title }}</span>
          </div>
          <p class="text-body-2 text-medium-emphasis my-2">{{ card.desc }}</p>
          <el-link type="primary" :underline="false" class="mt-2">
            {{ t('open') }}
            <AppIcon icon="mdi-arrow-right" class="ml-1" />
          </el-link>
        </el-card>
      </el-col>
    </el-row>

    <div v-if="version" class="version-badge" title="KeelBase">{{ version }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { authApi } from '@/api/auth'
import { workbenchApi } from '@/api/workbench'
import { adminApi } from '@/api/admin'

interface ShortcutCard {
  title: string
  desc: string
  icon: string
  to?: string
  href?: string
}

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const unread = ref(0)
const loading = ref(false)
const caps = useCapabilitiesStore()
const version = ref('')

function openCard(card: ShortcutCard) {
  if (card.href) {
    window.open(card.href, '_blank')
  } else if (card.to) {
    router.push(card.to)
  }
}

// E-3 加载体验：me 与 unread 并行请求（Promise.allSettled——me 失败不阻塞 unread），挂载时刷新完整资料
onMounted(async () => {
  caps.load() // 幂等：preset 已在布局层加载则直接复用，未加载则拉取（banner 响应式出现）
  loading.value = true
  const [me, unreadRes] = await Promise.allSettled([authApi.me(), workbenchApi.unreadCount()])
  if (me.status === 'fulfilled') auth.user = me.value
  if (unreadRes.status === 'fulfilled') unread.value = unreadRes.value.count
  loading.value = false
})

// 版本徽标：读 /app/version（公开端点）显示当前部署版本，固定于右下角
adminApi.appVersion().then((v) => { version.value = `v${v.latestVersion}` }).catch(() => {})

const user = computed(() => auth.user)

// 首启引导（P0-6）：当前 preset 与精简预设说明（full 不提示；small/lite 解释为何部分功能缺失）
const presetName = computed(() => caps.caps?.preset ?? '')
const presetDescription = computed(() => {
  switch (presetName.value) {
    case 'small':
      return t('presetSmallDesc')
    case 'lite':
      return t('presetLiteDesc')
    default:
      return ''
  }
})

const infoCards = computed(() => [
  { label: t('username'), value: user.value?.username ?? '-', icon: 'mdi-account-outline', color: 'primary' },
  { label: t('nicknameCol'), value: user.value?.nickname || user.value?.username || '-', icon: 'mdi-badge-account-outline', color: 'success' },
  { label: t('emailCol'), value: user.value?.email || '-', icon: 'mdi-email-outline', color: 'info' },
  { label: t('unreadCount'), value: unread.value, icon: 'mdi-bell-badge-outline', color: 'warning' },
])

const shortcutCards = computed(() => [
  { title: t('workbenchMyEvents'), desc: t('workbenchMyEventsDesc'), icon: 'mdi-calendar-blank-outline', to: '/workbench/events' },
  { title: t('workbenchMyTodos'), desc: t('workbenchMyTodosDesc'), icon: 'mdi-checkbox-marked-circle-outline', to: '/workbench/todos' },
  { title: t('workbenchNotifications'), desc: t('workbenchNotificationsDesc'), icon: 'mdi-bell-outline', to: '/workbench/notifications' },
  // AI 执行轨迹（P0-14）：用户可见的 AI 行为
  { title: t('aiTraceTitle'), desc: t('aiTraceDesc'), icon: 'mdi-robot-outline', to: '/workbench/ai-trace' },
  // AI 业务洞察（P0 AI Intelligence Dashboard）：风险/管道/逾期/任务/风险一键总览
  { title: t('aiIntelligence'), desc: t('aiIntelligenceHint'), icon: 'mdi-chart-box-outline', to: '/workbench/crm-dashboard' },
  // 移动主 App 预览（Flutter web，/mobile/ 新窗口）——Web 业务 UI 归工作台，Flutter 专注移动
  { title: t('workbenchMobilePreview'), desc: t('workbenchMobilePreviewDesc'), icon: 'mdi-cellphone', href: '/mobile/' },
])
</script>

<style scoped>
.shortcut-card {
  cursor: pointer;
}

.version-badge {
  position: fixed;
  right: 16px;
  bottom: 12px;
  z-index: 100;
  font-size: 12px;
  line-height: 1;
  color: var(--el-text-color-placeholder);
  letter-spacing: 0.3px;
  user-select: none;
}
</style>

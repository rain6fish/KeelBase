<template>
  <v-layout class="rounded rounded-md">
    <v-navigation-drawer v-model="ui.drawer" :rail="rail" permanent @click="onDrawerClick">
      <template #prepend>
        <v-list-item
          :title="t('appName')"
          subtitle="KeelBase"
          prepend-icon="mdi-keel"
          class="brand-item"
        />
      </template>

      <v-list v-if="auth.isAdmin" density="comfortable" nav>
        <v-list-item
          :prepend-icon="'mdi-view-dashboard-outline'"
          :title="t('overview')"
          :active="route.path === '/'"
          @click="go('/')"
        />
      </v-list>

      <template v-for="group in navGroups" :key="group.label">
        <div class="nav-group-label">{{ group.label }}</div>
        <v-list density="comfortable" nav>
          <v-list-item
            v-for="item in group.items"
            :key="item.to"
            :prepend-icon="item.icon"
            :title="item.label"
            :active="isActive(item.name)"
            @click="go(item.to)"
          />
        </v-list>
      </template>

      <template #append>
        <div class="px-2 py-3">
          <v-divider class="mb-2" />
          <v-list-item
            :title="auth.user?.username || '-'"
            :subtitle="auth.user?.role || ''"
            prepend-icon="mdi-account-circle"
          />
          <div class="d-flex justify-space-between align-center px-2">
            <LangToggle />
            <ThemeToggle />
            <v-btn icon="mdi-logout" variant="text" size="small" :title="t('logout')" @click="onLogout" />
          </div>
        </div>
      </template>
    </v-navigation-drawer>

    <v-main class="admin-main">
      <v-app-bar elevation="0" border="b" class="admin-topbar">
        <v-app-bar-nav-icon variant="text" @click.stop="toggleRail" />
        <v-breadcrumbs :items="breadcrumbs" class="flex-grow-0" />
        <v-spacer />
        <ThemeToggle />
        <LangToggle />
        <v-btn variant="tonal" prepend-icon="mdi-logout" :title="t('logout')" @click="onLogout">
          {{ t('logout') }}
        </v-btn>
      </v-app-bar>

      <v-container fluid class="v-content-pad">
        <router-view />
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LangToggle from '@/components/LangToggle.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const ui = useUiStore()
const auth = useAuthStore()
// MOD-4：按 capabilities 隐藏未启用业务模块的导航入口
const caps = useCapabilitiesStore()
caps.load()

const rail = ref(false)
function toggleRail() {
  rail.value = !rail.value
}
// rail 折叠时点击任意区域展开
function onDrawerClick() {
  if (rail.value) rail.value = false
}

function go(path: string) {
  router.push(path)
}

function isActive(name: string): boolean {
  // 详情页归其父导航激活（users/:id → 用户管理高亮）
  return route.name === name || (name === 'users' && route.name === 'user-detail')
}

async function onLogout() {
  await auth.logout()
  router.replace('/login')
}

const breadcrumbs = computed(() => {
  const metaTitle = route.meta?.title as string | undefined
  return [
    { title: t('appName') },
    ...(metaTitle ? [{ title: t(metaTitle) }] : []),
  ]
})

// 工作台（应用侧）导航：普通企业用户；WEB-FRONT-3 子页在此追加
const workspaceNavGroups = computed(() => [
  {
    label: t('navWorkbench'),
    items: [{ name: 'workbench-home', to: '/workbench', icon: 'mdi-home-outline', label: t('navWorkbench') }],
  },
  {
    label: t('navMy'),
    items: [
      { name: 'workbench-events', to: '/workbench/events', icon: 'mdi-calendar-blank-outline', label: t('workbenchMyEvents') },
      { name: 'workbench-todos', to: '/workbench/todos', icon: 'mdi-checkbox-marked-circle-outline', label: t('workbenchMyTodos') },
      { name: 'workbench-notifications', to: '/workbench/notifications', icon: 'mdi-bell-outline', label: t('workbenchNotifications') },
      { name: 'workbench-ai-trace', to: '/workbench/ai-trace', icon: 'mdi-robot-outline', label: t('aiTraceTitle') },
      { name: 'workbench-org', to: '/workbench/org', icon: 'mdi-account-group-outline', label: t('workbenchOrgDir') },
      { name: 'workbench-crm', to: '/workbench/crm', icon: 'mdi-account-star-outline', label: t('crmTitle') },
      { name: 'workbench-pm', to: '/workbench/pm', icon: 'mdi-briefcase-outline', label: t('pmTitle') },
      { name: 'workbench-approval', to: '/workbench/approval', icon: 'mdi-check-decagram-outline', label: t('apTitle') },
    ],
  },
])

// 控制台（管理侧）导航：对齐旧 NAV_GROUPS；P3 新增页面在对应组追加
// MOD-4：带 module 的业务模块页按 capabilities 过滤隐藏
const consoleNavGroups = computed(() => [
  {
    label: t('navData'),
    items: [
      { name: 'users', to: '/users', icon: 'mdi-account-group-outline', label: t('navUsers') },
      { name: 'org', to: '/org', icon: 'mdi-sitemap', label: t('navOrg'), module: 'org' },
      { name: 'events', to: '/events', icon: 'mdi-calendar-blank-outline', label: t('navEvents'), module: 'events' },
      { name: 'knowledge', to: '/knowledge', icon: 'mdi-book-open-variant', label: t('navKnowledge') },
      { name: 'notifications', to: '/notifications', icon: 'mdi-bullhorn-outline', label: t('navNotifications') },
      { name: 'trash', to: '/trash', icon: 'mdi-delete-outline', label: t('navTrash') },
      { name: 'data-import', to: '/data-import', icon: 'mdi-upload-multiple', label: t('navDataImport') },
      { name: 'contracts', to: '/contracts', icon: 'mdi-database-outline', label: t('navContracts') },
      { name: 'suppliers', to: '/suppliers', icon: 'mdi-database-outline', label: t('navSuppliers') },
      { name: 'tags', to: '/tags', icon: 'mdi-database-outline', label: t('navTags'), module: 'tags' },
      { name: 'notes', to: '/notes', icon: 'mdi-database-outline', label: t('navNotes'), module: 'notes' },
    ].filter((item: { module?: string }) => !item.module || caps.isModuleEnabled(item.module)),
  },
  {
    label: t('navMonitor'),
    items: [
      { name: 'monitor', to: '/monitor', icon: 'mdi-heart-pulse', label: t('navMonitorCenter') },
      { name: 'ops', to: '/ops', icon: 'mdi-wrench-outline', label: t('navOps') },
      { name: 'audit', to: '/audit', icon: 'mdi-history', label: t('navAiAudit') },
      { name: 'op-audit', to: '/op-audit', icon: 'mdi-clipboard-text-outline', label: t('navOpAudit') },
      { name: 'sessions', to: '/sessions', icon: 'mdi-monitor-cellphone', label: t('navSessions') },
      { name: 'analytics', to: '/analytics', icon: 'mdi-chart-areaspline', label: t('navAnalytics') },
      { name: 'ai-eval', to: '/ai-eval', icon: 'mdi-flask-outline', label: t('navAiEval') },
      { name: 'ai-timeline', to: '/ai-timeline', icon: 'mdi-timeline-clock-outline', label: t('navAiTimeline') },
    ],
  },
  {
    label: t('navSystem'),
    items: [
      { name: 'observability', to: '/observability', icon: 'mdi-lan', label: t('navObservability') },
      { name: 'system', to: '/system', icon: 'mdi-cog-outline', label: t('navSystemInfo') },
      { name: 'templates', to: '/templates', icon: 'mdi-view-grid-plus-outline', label: t('navTemplates') },
      { name: 'ai-tools', to: '/ai-tools', icon: 'mdi-tools', label: t('navAiTools') },
      { name: 'mcp', to: '/mcp', icon: 'mdi-connection', label: t('navMcp') },
    ],
  },
])

const navGroups = computed(() => (auth.isAdmin ? consoleNavGroups.value : workspaceNavGroups.value))
</script>

<style scoped>
.admin-main {
  background-color: rgb(var(--v-theme-background));
}
.brand-item {
  min-height: 56px;
}
</style>

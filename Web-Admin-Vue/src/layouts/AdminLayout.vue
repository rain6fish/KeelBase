<template>
  <el-container class="admin-shell">
    <el-aside :width="rail ? '64px' : '240px'" class="admin-aside">
      <div class="brand-item px-3 d-flex align-center">
        <AppLogo :width="rail ? 30 : 88" />
      </div>

      <div class="admin-nav">
        <el-menu
          :default-active="activeMenu"
          :collapse="rail"
          :collapse-transition="false"
          class="el-menu-nav"
        >
          <el-menu-item v-if="showOverview" index="/" @click="go('/')">
            <AppIcon icon="mdi-view-dashboard-outline" />
            <template #title>{{ t('overview') }}</template>
          </el-menu-item>

          <template v-for="group in navGroups" :key="group.label">
            <div v-if="!rail" class="nav-group-label">{{ group.label }}</div>
            <el-menu-item
              v-for="item in group.items"
              :key="item.to"
              :index="item.to"
              @click="go(item.to)"
            >
              <AppIcon :icon="item.icon" />
              <template #title>{{ item.label }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </div>

      <div class="admin-aside-append pa-3">
        <div class="d-flex align-center ga-2 mb-2">
          <AppIcon icon="mdi-account-circle" size="22" />
          <div v-if="!rail">
            <div class="text-body-2">{{ auth.user?.username || '-' }}</div>
            <div class="text-caption text-medium-emphasis">{{ auth.user?.role || '' }}</div>
          </div>
        </div>
        <div class="d-flex justify-space-between align-center">
          <LangToggle />
          <ThemeSwitcher />
          <el-button circle size="small" :title="t('logout')" @click="onLogout">
            <AppIcon icon="mdi-logout" />
          </el-button>
        </div>
      </div>
    </el-aside>

    <el-container class="admin-main">
      <el-header class="admin-topbar d-flex align-center ga-3">
        <el-button circle @click="toggleRail">
          <AppIcon :icon="rail ? 'mdi-menu-open' : 'mdi-menu'" />
        </el-button>
        <el-breadcrumb separator="/" class="flex-grow-1">
          <el-breadcrumb-item v-for="b in breadcrumbs" :key="b.title">{{ b.title }}</el-breadcrumb-item>
        </el-breadcrumb>
        <el-button v-if="showOverview" class="ai-assistant-btn" @click="aiDrawerOpen = true">
          <template #icon><AppIcon icon="mdi-robot-happy-outline" size="20" /></template>
          {{ t('navSystemAssistant') }}
        </el-button>
        <ThemeToggle />
        <LangToggle />
        <el-button type="primary" plain @click="onLogout">
          <template #icon><AppIcon icon="mdi-logout" /></template>
          {{ t('logout') }}
        </el-button>
      </el-header>

      <el-main class="v-content-pad">
        <router-view />
      </el-main>
    </el-container>

    <AiAssistantDrawer v-model="aiDrawerOpen" />
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import LangToggle from '@/components/LangToggle.vue'
import AiAssistantDrawer from '@/components/AiAssistantDrawer.vue'
import AppLogo from '@/components/AppLogo.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const auth = useAuthStore()
// MOD-4：按 capabilities 隐藏未启用业务模块的导航入口
const caps = useCapabilitiesStore()
caps.load()

const rail = ref(false)
const aiDrawerOpen = ref(false)
function toggleRail() {
  rail.value = !rail.value
}

function go(path: string) {
  router.push(path)
}

async function onLogout() {
  await auth.logout()
  router.replace('/login')
}

const activeMenu = computed(() => route.path)

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
      { name: 'system-ai-assistant', to: '/system-ai-assistant', icon: 'mdi-robot-outline', label: t('navSystemAssistant') },
      { name: 'observability', to: '/observability', icon: 'mdi-lan', label: t('navObservability') },
      { name: 'system', to: '/system', icon: 'mdi-cog-outline', label: t('navSystemInfo') },
      { name: 'templates', to: '/templates', icon: 'mdi-view-grid-plus-outline', label: t('navTemplates') },
      { name: 'ai-tools', to: '/ai-tools', icon: 'mdi-tools', label: t('navAiTools') },
      { name: 'ai-approvals', to: '/ai-approvals', icon: 'mdi-shield-check-outline', label: t('navAiApprovals') },
      { name: 'security-review', to: '/security-review', icon: 'mdi-shield-search-outline', label: t('navSecurityReview') },
      { name: 'mcp', to: '/mcp', icon: 'mdi-connection', label: t('navMcp') },
    ],
  },
])

// user 构建（/user/）没有控制台路由，任何角色都只显示工作台菜单
const isUserSurface = import.meta.env.MODE === 'user'
const showOverview = computed(() => !isUserSurface && auth.isAdmin)
const navGroups = computed(() => (isUserSurface || !auth.isAdmin ? workspaceNavGroups.value : consoleNavGroups.value))
</script>

<style scoped>
.admin-shell {
  height: 100vh;
}
.admin-aside {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  transition: width 0.2s;
  overflow: hidden;
}
.brand-item {
  height: 56px;
  display: flex;
  align-items: center;
}
.admin-nav {
  flex: 1;
  overflow-y: auto;
}
.el-menu-nav {
  border-right: none;
  width: 100%;
}
.nav-group-label {
  padding: 8px 16px 4px;
}
.admin-aside-append {
  border-top: 1px solid var(--el-border-color-light);
}
.admin-main {
  min-width: 0;
}
.admin-topbar {
  background: var(--el-bg-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.ai-assistant-btn {
  border: none;
  border-radius: var(--el-border-radius-round);
  height: 36px;
  padding: 0 16px;
  background: linear-gradient(135deg, var(--keel-brand-gradient-from, var(--el-color-primary)) 0%, var(--keel-brand-gradient-to, var(--el-color-primary)) 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 14px var(--keel-glow, rgba(79, 70, 229, 0.3));
}
.ai-assistant-btn:hover,
.ai-assistant-btn:focus,
.ai-assistant-btn:active {
  color: #fff;
  background: linear-gradient(135deg, var(--keel-brand-gradient-from, var(--el-color-primary)) 0%, var(--keel-brand-gradient-to, var(--el-color-primary)) 100%);
  filter: brightness(1.06);
}
</style>

<template>
  <el-container class="admin-shell">
    <el-aside :width="rail ? '64px' : '240px'" class="admin-aside">
      <div class="brand-item px-3">
        <div class="d-flex align-center ga-2">
          <AppLogo :size="26" />
          <span v-if="!rail" class="text-h6 font-weight-bold">{{ t('appName') }}</span>
        </div>
      </div>

      <div ref="adminNavRef" class="admin-nav" @mouseenter="flashAdminScroll" @scroll.passive="flashAdminScroll">
        <el-menu
          :key="activeGroup"
          :default-active="activeMenu"
          :default-openeds="defaultOpeneds"
          :collapse="rail"
          :collapse-transition="false"
          class="el-menu-nav"
        >
          <el-menu-item v-if="showOverview" index="/" @click="go('/')">
            <AppIcon icon="mdi-view-dashboard-outline" />
            <template #title>{{ t('overview') }}</template>
          </el-menu-item>

          <!-- Materio 式二级可折叠菜单：一级分组（图标+标题，可展开/折叠），二级子项；组内有激活子项时一级显示浅色 -->
          <el-sub-menu v-for="group in navGroups" :key="group.label" :index="group.label" :class="{ 'is-active-group': group.label === activeGroup }">
            <template #title>
              <AppIcon :icon="group.icon" />
              <span>{{ group.label }}</span>
            </template>
            <el-menu-item
              v-for="item in group.items"
              :key="item.to"
              :index="item.to"
              @click="go(item.to)"
            >
              <AppIcon :icon="item.icon" />
              <template #title>{{ item.label }}</template>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
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
        <!-- AI 助手：管理员=系统助手，普通用户=本人数据作用域助手（抽屉内按角色分流） -->
        <el-button class="ai-btn" @click="aiDrawerOpen = true">
          <template #icon><AppIcon icon="mdi-robot-happy-outline" size="18" /></template>
          AI
        </el-button>
        <ThemeSwitcher />
        <LangToggle />
        <el-avatar :size="26" class="admin-avatar">{{ (auth.user?.username || 'U')[0].toUpperCase() }}</el-avatar>
        <span class="text-body-2 text-medium-emphasis">{{ auth.user?.username || '' }}</span>
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

// 菜单滚动条：浏览器原生（拖动灵敏丝滑），滑块平时隐藏，鼠标滑过/滚动时显示 1.6s 后隐藏
const adminNavRef = ref<HTMLElement | null>(null)
let scrollFlashTimer: number | undefined
function flashAdminScroll() {
  adminNavRef.value?.classList.add('scroll-flash')
  clearTimeout(scrollFlashTimer)
  scrollFlashTimer = window.setTimeout(() => adminNavRef.value?.classList.remove('scroll-flash'), 1600)
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
    icon: 'mdi-apps',
    items: [{ name: 'workbench-home', to: '/workbench', icon: 'mdi-home-outline', label: t('navWorkbench') }],
  },
  {
    label: t('navMy'),
    icon: 'mdi-account-circle-outline',
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
    icon: 'mdi-folder-multiple-outline',
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
    label: t('navGuard'),
    icon: 'mdi-shield-check',
    items: [
      { name: 'agent-registry', to: '/agent-registry', icon: 'mdi-robot-outline', label: t('navAgents') },
      { name: 'policy-center', to: '/policy-center', icon: 'mdi-shield-key-outline', label: t('navPolicyCenter') },
      { name: 'security-review', to: '/security-review', icon: 'mdi-shield-search-outline', label: t('navSecurityReview') },
      { name: 'ai-approvals', to: '/ai-approvals', icon: 'mdi-shield-check-outline', label: t('navAiApprovals') },
      { name: 'audit', to: '/audit', icon: 'mdi-history', label: t('navAiAudit') },
      { name: 'op-audit', to: '/op-audit', icon: 'mdi-clipboard-text-outline', label: t('navOpAudit') },
      { name: 'ai-timeline', to: '/ai-timeline', icon: 'mdi-timeline-clock-outline', label: t('navAiTimeline') },
      { name: 'ai-tools', to: '/ai-tools', icon: 'mdi-tools', label: t('navAiTools') },
      { name: 'ai-eval', to: '/ai-eval', icon: 'mdi-flask-outline', label: t('navAiEval') },
      { name: 'mcp', to: '/mcp', icon: 'mdi-connection', label: t('navMcp') },
    ],
  },
  {
    label: t('navMonitor'),
    icon: 'mdi-heart-pulse',
    items: [
      { name: 'monitor', to: '/monitor', icon: 'mdi-heart-pulse', label: t('navMonitorCenter') },
      { name: 'ops', to: '/ops', icon: 'mdi-wrench-outline', label: t('navOps') },
      { name: 'sessions', to: '/sessions', icon: 'mdi-monitor-cellphone', label: t('navSessions') },
      { name: 'analytics', to: '/analytics', icon: 'mdi-chart-areaspline', label: t('navAnalytics') },
    ],
  },
  {
    label: t('navSystem'),
    icon: 'mdi-cog-outline',
    items: [
      { name: 'system-ai-assistant', to: '/system-ai-assistant', icon: 'mdi-robot-outline', label: t('navSystemAssistant') },
      { name: 'observability', to: '/observability', icon: 'mdi-lan', label: t('navObservability') },
      { name: 'system', to: '/system', icon: 'mdi-cog-outline', label: t('navSystemInfo') },
      { name: 'templates', to: '/templates', icon: 'mdi-view-grid-plus-outline', label: t('navTemplates') },
    ],
  },
])

// user 构建（/user/）没有控制台路由，任何角色都只显示工作台菜单
const isUserSurface = import.meta.env.MODE === 'user'
const showOverview = computed(() => !isUserSurface && auth.isAdmin)
const navGroups = computed(() => (isUserSurface || !auth.isAdmin ? workspaceNavGroups.value : consoleNavGroups.value))
// 默认展开当前路由所在的一级分组（Materio 式二级菜单）
const defaultOpeneds = computed(() => {
  const active = navGroups.value.find((g) => g.items.some((i) => route.path.startsWith(i.to) && i.to !== '/'))
  return active ? [active.label] : []
})
// 当前激活路由所属的一级分组（其标题显示浅色底，表示该组有激活子项）
const activeGroup = computed(
  () =>
    navGroups.value.find((g) => g.items.some((i) => route.path.startsWith(i.to) && i.to !== '/'))?.label ?? '',
)
</script>

<style scoped>
.admin-shell {
  height: 100vh;
}
.admin-aside {
  display: flex;
  flex-direction: column;
  /* 与内容区同底色（浅灰），整页一体；菜单激活项/卡片作为悬浮元素 */
  background: var(--el-bg-color-page);
  border-right: none;
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
  /* 自定义滚动条滑块定位参照 */
  position: relative;
}
.el-menu-nav {
  border-right: none;
  width: 100%;
  /* 菜单底色与侧边栏/整体一致（浅灰），由激活项/悬停色块提供悬浮感 */
  background: transparent;
  --el-menu-bg-color: transparent;
  /* 右侧留出滑块空隙（16px），自定义滚动条不覆盖菜单项，避免误点/误选 */
  padding-right: 16px;
}
.nav-group-label {
  padding: 8px 16px 4px;
}
.admin-main {
  min-width: 0;
}
.admin-topbar {
  /* 与内容区同底色（浅灰），一体；不压阴影 */
  background: var(--el-bg-color-page);
  box-shadow: none;
}
/* 登录名左侧头像 */
.admin-avatar {
  background: var(--el-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}
</style>

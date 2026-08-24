import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { storage } from '@/utils/storage'

// 角色首页：admin → 控制台 dashboard，其余 → 工作台。唯一合法首页保证分流不互踢
// user 构建（/user/ 普通用户工作台）没有控制台路由，任何角色都回落工作台，避免守卫互踢死循环
const SURFACE: 'user' | 'admin' = import.meta.env.MODE === 'user' ? 'user' : 'admin'
export function homeFor(role?: string): string {
  if (SURFACE === 'user') return '/workbench'
  // admin 构建无 workbench 路由：非 admin 回落 /403（否则 /workbench 不存在 → catch-all → / → 守卫死循环）
  return role === 'admin' ? '/' : '/403'
}

export function setupGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const hasToken = !!storage.readTokens().accessToken

    // 公开页（登录 / 403）不需要登录
    if (to.meta.public) {
      // 已登录再访问 /login 按角色回各自首页（防循环）
      if (to.path === '/login' && hasToken && auth.status === 'authenticated') {
        return homeFor(auth.user?.role)
      }
      return true
    }

    if (!hasToken) {
      auth.status = 'unauthenticated'
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 有 token 但尚未加载用户 → 加载用户信息
    if (auth.status !== 'authenticated') {
      await auth.tryAutoLogin()
      if (auth.status === 'unauthenticated') return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 角色校验：user 构建（/user/）无控制台路由，任何角色回落工作台（防守卫互踢死循环）；
    // 仅 admin 构建按角色校验
    const roles = to.meta.roles
    if (SURFACE !== 'user' && roles && !roles.includes(auth.user!.role)) {
      return homeFor(auth.user!.role)
    }

    // MOD-4：目标路由属于被 capabilities 禁用的业务模块 → 弹回角色首页
    const module = to.meta.module
    if (module) {
      const caps = useCapabilitiesStore()
      await caps.load()
      if (!caps.isModuleEnabled(module)) {
        return homeFor(auth.user!.role)
      }
    }

    return true
  })
}

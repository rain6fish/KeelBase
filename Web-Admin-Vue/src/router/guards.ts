import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { storage } from '@/utils/storage'

// 角色首页：admin → 控制台 dashboard，其余 → 工作台。唯一合法首页保证分流不互踢
export function homeFor(role?: string): string {
  return role === 'admin' ? '/' : '/workbench'
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

    // 角色校验：路由声明了 roles 而当前用户不匹配 → 弹回角色首页
    const roles = to.meta.roles
    if (roles && !roles.includes(auth.user!.role)) {
      return homeFor(auth.user!.role)
    }

    return true
  })
}

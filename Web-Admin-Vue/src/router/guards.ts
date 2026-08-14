import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { storage } from '@/utils/storage'

export function setupGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const hasToken = !!storage.readTokens().accessToken

    // 公开页（登录 / 403）不需要登录
    if (to.meta.public) {
      // 已登录且是 admin，再访问 /login 则回首页
      if (to.path === '/login' && hasToken && auth.status === 'authenticated') {
        return '/'
      }
      return true
    }

    if (!hasToken) {
      auth.status = 'unauthenticated'
      return '/login'
    }

    // 有 token 但尚未加载用户 → 校验 role=admin
    if (auth.status !== 'authenticated') {
      await auth.tryAutoLogin()
      if (auth.status === 'forbidden') return '/403'
      if (auth.status === 'unauthenticated') return '/login'
    }

    return true
  })
}

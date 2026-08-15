import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Box, CircularProgress } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { storage } from '@/utils/storage'

// 角色首页：admin → 控制台 dashboard，其余 → 工作台。唯一合法首页保证分流不互踢
export function homeFor(role?: string): string {
  return role === 'admin' ? '/' : '/workbench'
}

function redirectToLogin(navigate: ReturnType<typeof useNavigate>, path: string) {
  navigate(`/login?redirect=${encodeURIComponent(path)}`, { replace: true })
}

/** 复刻 Vue guards.ts 顺序：public 绕过（login/403 为顶层路由不在 gate 内）→ token → tryAutoLogin → roles */
export function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const tryAutoLogin = useAuthStore((s) => s.tryAutoLogin)
  const [checked, setChecked] = useState(false)
  // C5: once-guard —— 避免 status 订阅变化 / StrictMode 双调用触发并发 /auth/me
  const ranOnce = useRef(false)

  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true
    let cancelled = false
    const path = location.pathname
    ;(async () => {
      const hasToken = !!storage.readTokens().accessToken
      if (!hasToken) {
        if (!cancelled) redirectToLogin(navigate, path)
        return
      }

      let state = useAuthStore.getState()
      if (state.status !== 'authenticated') {
        await tryAutoLogin()
        state = useAuthStore.getState()
      }
      if (cancelled) return
      if (state.status !== 'authenticated' || !state.user) {
        redirectToLogin(navigate, path)
        return
      }

      // 角色校验：workbench 要求普通用户，其余控制台要求 admin
      const isWorkbench = path === '/workbench' || path.startsWith('/workbench/')
      const requiredRole = isWorkbench ? 'user' : 'admin'
      if (state.user.role !== requiredRole) {
        navigate(isWorkbench ? '/' : '/workbench', { replace: true })
        return
      }
      setChecked(true)
    })()
    return () => {
      cancelled = true
    }
  }, [location.pathname, navigate, tryAutoLogin])

  if (!checked) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    )
  }
  return <>{children}</>
}

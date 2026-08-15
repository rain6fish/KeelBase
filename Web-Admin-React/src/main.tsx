import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import './i18n'
import App from './App'
import { router } from './router'
import { setOnAuthFailure } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

// C1: 401 刷新失败 → 重置认证状态并跳回登录页（带 redirect 回到原页面）
setOnAuthFailure(() => {
  useAuthStore.setState({ status: 'unauthenticated', user: null })
  const current = router.state.location.pathname
  void router.navigate(`/login?redirect=${encodeURIComponent(current)}`)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

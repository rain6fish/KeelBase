import { PropsWithChildren, useEffect } from 'react'
import Taro from '@tarojs/taro'
import './app.scss'

const PUBLIC_PAGES = ['/pages/login/index', '/pages/main/index']

function App({ children }: PropsWithChildren<any>) {
  // 兼容旧版独立路由 hash：统一进入 main（单页壳），其余认证逻辑由 AdminLayout 处理
  useEffect(() => {
    const { path } = Taro.getCurrentInstance().router ?? {}
    if (path && !PUBLIC_PAGES.includes(path)) {
      Taro.redirectTo({ url: '/pages/main/index' })
    }
  }, [])

  return children
}

export default App

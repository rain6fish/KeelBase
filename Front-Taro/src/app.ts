import { createApp } from 'vue'
import { useAuthStore } from './stores/auth-store'
import { useThemeStore } from './stores/theme-store'
import './app.scss'

// Taro Vue3 入口：导出 createApp 实例，框架自动挂载。
// stores 迁移到 pinia 后，在此 app.use(createPinia()) 并改用 pinia API。
const App = createApp({})

// 启动初始化（模块顶层执行，store 迁移中暂用 zustand API）
useAuthStore.getState().tryAutoLogin()
useThemeStore.getState().initialize()

export default App

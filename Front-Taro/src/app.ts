import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from './stores/auth-store'
import { useThemeStore } from './stores/theme-store'
import { useI18nStore } from './stores/i18n-store'
import './app.scss'

const pinia = createPinia()

const App = createApp({})
App.use(pinia)

// 启动初始化（pinia 激活后，组件外调用需传实例）
useAuthStore(pinia).tryAutoLogin()
useThemeStore(pinia).initialize()
useI18nStore(pinia).initLocale()

export default App

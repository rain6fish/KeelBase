import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/public-sans'
import '@mdi/font/css/materialdesignicons.css'
// Element Plus 按需引入：组件/指令/样式由 vite 的 unplugin 插件注入，这里只保留
// 深色模式 css-vars（html.dark 触发）与应用主题覆盖。
// base.css 须在主题 scss 之前显式引入：按需模式 base.css 由组件样式链引入，
// 位置在主题 scss 之后会覆盖自定义 --el-color-*（浅色 :root 同特异性后者胜）。
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/element-theme.scss'
import './styles/vuetify-compat.scss'
import './styles/main.scss'

import App from './App.vue'
import router from './router'
import AppIcon from './components/AppIcon.vue'
import { i18n } from './i18n'
import { setOnAuthFailure } from './api/client'
import { useAuthStore } from './stores/auth'
import { vPermission } from './directives/permission'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.component('AppIcon', AppIcon)
app.directive('permission', vPermission)
app.use(i18n)

// 401 刷新失败 → 重置会话并回登录页（token 失效/被撤销/角色变更）
setOnAuthFailure(() => {
  const auth = useAuthStore()
  auth.status = 'unauthenticated'
  auth.user = null
  auth.errorMessage = ''
  if (router.currentRoute.value.path !== '/login') {
    router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})

app.mount('#app')

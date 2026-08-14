import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/public-sans'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import './styles/main.scss'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { i18n } from './i18n'
import { setOnAuthFailure } from './api/client'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(vuetify)
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

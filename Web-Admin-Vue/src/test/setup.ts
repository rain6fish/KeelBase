// SPDX-License-Identifier: Apache-2.0

import { beforeEach } from 'vitest'
import { config } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'

// 与 main.ts 的全局注册保持一致：组件模板用 <AppIcon>，测试挂载无 app.component 注册时会「Failed to resolve component」。
config.global.components = { AppIcon }
// 全局注入 router：组件内 useRouter/useRoute 依赖 Symbol(router) 注入，测试未装 router 时会「injection not found」。
config.global.plugins = [createRouter({ history: createMemoryHistory(), routes: [] })]

// 每个用例前清空 localStorage（storage util 依赖它）
beforeEach(() => {
  localStorage.clear()
})

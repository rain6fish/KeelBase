// SPDX-License-Identifier: Apache-2.0

import { createRouter, createWebHashHistory } from 'vue-router'
import routes from './routes'
import { setupGuards } from './guards'

// hash 模式：单容器 Nest 静态托管无 SPA fallback，hash 让 nginx + 单容器两套部署链零改动
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
})

setupGuards(router)

export default router

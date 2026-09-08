// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import routes from '@/router/routes'
import { setupGuards } from '@/router/guards'
import { storage } from '@/utils/storage'
import { useAuthStore } from '@/stores/auth'

const adminUser = { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin' as const }
const userUser = { id: 2, username: 'alex', email: 'alex@example.com', role: 'user' as const }

function makeRouter(): Router {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  setupGuards(router)
  return router
}

async function loginAs(role: 'admin' | 'user') {
  storage.saveTokens('at', 'rt')
  const store = useAuthStore()
  store.user = role === 'admin' ? adminUser : userUser
  store.status = 'authenticated'
}

describe('路由守卫角色分流', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('普通用户访问控制台路由 → 弹回工作台', async () => {
    const router = makeRouter()
    await loginAs('user')

    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/workbench')

    await router.push('/users')
    expect(router.currentRoute.value.path).toBe('/workbench')
  }, 30000)

  it('普通用户访问工作台 → 停驻', async () => {
    const router = makeRouter()
    await loginAs('user')

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/workbench')
  })

  it('普通用户访问工作台子页 → 停驻', async () => {
    const router = makeRouter()
    await loginAs('user')

    await router.push('/workbench/events')
    expect(router.currentRoute.value.path).toBe('/workbench/events')
  })

  it('admin 访问工作台子页 → 弹回控制台', async () => {
    const router = makeRouter()
    await loginAs('admin')

    await router.push('/workbench/events')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('P0-1 admin 评审路径：Trust 沙盘/执行轨迹/业务动作详情对 admin 放开（控制台壳内直达）', async () => {
    const router = makeRouter()
    await loginAs('admin')

    await router.push('/workbench/trust-sandbox')
    expect(router.currentRoute.value.path).toBe('/workbench/trust-sandbox')

    await router.push('/workbench/ai-trace')
    expect(router.currentRoute.value.path).toBe('/workbench/ai-trace')

    await router.push('/workbench/action/crm_customer/42')
    expect(router.currentRoute.value.path).toBe('/workbench/action/crm_customer/42')
  })

  it('admin 访问其余工作台页（如事件）仍弹回控制台（不落地日常业务）', async () => {
    const router = makeRouter()
    await loginAs('admin')

    await router.push('/workbench/todos')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('admin 访问控制台 → 停驻', async () => {
    const router = makeRouter()
    await loginAs('admin')

    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('admin 访问工作台 → 弹回控制台', async () => {
    const router = makeRouter()
    await loginAs('admin')

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('匿名访问受保护路由 → /login 并带 redirect', async () => {
    const router = makeRouter()

    await router.push('/users')

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/users')
  })

  it('已登录用户访问 /login → 按角色回首页', async () => {
    const userRouter = makeRouter()
    await loginAs('user')
    await userRouter.push('/login')
    expect(userRouter.currentRoute.value.path).toBe('/workbench')

    const adminRouter = makeRouter()
    await loginAs('admin')
    await adminRouter.push('/login')
    expect(adminRouter.currentRoute.value.path).toBe('/')
  })
})

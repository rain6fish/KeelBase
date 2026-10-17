// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import routes, { AUDITOR_PAGES } from '@/router/routes'
import { setupGuards } from '@/router/guards'
import { storage } from '@/utils/storage'
import { useAuthStore } from '@/stores/auth'

const adminUser = { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin' as const }
const userUser = { id: 2, username: 'alex', email: 'alex@example.com', role: 'user' as const }
const auditorUser = { id: 3, username: 'aud', email: 'aud@example.com', role: 'auditor' as const }

function makeRouter(): Router {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes })
  setupGuards(router)
  return router
}

async function loginAs(role: 'admin' | 'user' | 'auditor') {
  storage.saveTokens('at', 'rt')
  const store = useAuthStore()
  store.user = role === 'admin' ? adminUser : role === 'auditor' ? auditorUser : userUser
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
    expect(router.currentRoute.value.path).toBe('/workbench/ai')

    await router.push('/users')
    expect(router.currentRoute.value.path).toBe('/workbench/ai')
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
    expect(userRouter.currentRoute.value.path).toBe('/workbench/ai')

    const adminRouter = makeRouter()
    await loginAs('admin')
    await adminRouter.push('/login')
    expect(adminRouter.currentRoute.value.path).toBe('/')
  })
})

/**
 * Auditor (AW-2) reachable console pages: the six read-only API surfaces must be reachable, the
 * write/decision pages must not, and the landing page must stay on the audit log.
 * AW-2：审计读者（auditor）的控制台可达面。
 * 六个只读 API 面（治理策略 + 版本历史、工具清单、R4 审批队列的读侧）在 2026-10-17 陆续开放，
 * 但 AUDITOR_PAGES 仍只到 /audit —— API 到得了、UI 里点不进去。这组用例钉住：
 * ① 只读页可达；② 写 / 裁决页仍不可达；③ 落点仍然是 /audit。
 */
describe('审计读者（AW-2）控制台可达面', () => {
  it('落到 /audit：审计记录是第一份读数', async () => {
    const router = makeRouter()
    await loginAs('auditor')

    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/audit')
  })

  it('六个读面对应的只读页可达（审计 / 策略与历史 / 工具清单 / 审批队列）', async () => {
    const router = makeRouter()
    await loginAs('auditor')

    for (const path of ['/audit', '/policy-center', '/ai-tools', '/ai-approvals']) {
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(path)
    }
  })

  it('写 / 裁决页仍不可达：点进去弹回 /audit，不落地 403 页', async () => {
    const router = makeRouter()
    await loginAs('auditor')

    // Users (CRUD), trash (restore), import (write), sessions (remote logout), operation audit (not opened).
    // 用户管理（增删改）、回收站（恢复）、数据导入（写入）、会话（远程登出）、操作审计（未开放）
    for (const path of ['/users', '/trash', '/data-import', '/sessions', '/op-audit']) {
      await router.push(path)
      expect(router.currentRoute.value.path).toBe('/audit')
    }
  })

  it('允许集恰为这四个只读页 —— 多放一页（含任何写 / 裁决页）即红', () => {
    expect([...AUDITOR_PAGES].sort()).toEqual(['ai-approvals', 'ai-tools', 'audit', 'policy-center'])
  })
})

describe('能力细门（WEB-FRONT-2：roles 管壳 + meta.permission 细判）', () => {
  function cap(subject: string, scope: 'all' | 'own') {
    return { subject, scope, actions: ['create', 'read', 'update', 'delete'], reason: 'x' }
  }

  async function loginAsWithCaps(permissions: {
    role: string
    basis: string
    resources: { subject: string; scope: 'all' | 'own'; actions: string[]; reason: string }[]
  } | null) {
    storage.saveTokens('at', 'rt')
    const store = useAuthStore()
    store.user = userUser
    store.status = 'authenticated'
    store.permissions = permissions as never
    store.permissionsLoaded = true // 已置位 → loadPermissions 不发请求（避免测试打网络）
  }

  it('user 有 CrmCustomer/own → 声明 permission 的工作台路由可达', async () => {
    const router = makeRouter()
    await loginAsWithCaps({ role: 'user', basis: 'x', resources: [cap('CrmCustomer', 'own')] })
    await router.push('/workbench/crm')
    expect(router.currentRoute.value.path).toBe('/workbench/crm')
  })

  it('user 无 CrmCustomer → 声明 permission 的路由弹回工作台', async () => {
    const router = makeRouter()
    await loginAsWithCaps({ role: 'user', basis: 'x', resources: [cap('User', 'own')] })
    await router.push('/workbench/crm')
    expect(router.currentRoute.value.path).toBe('/workbench/ai')
  })

  it('清单不可用（null）→ 跳过能力门，roles 仍生效（不因基础设施故障挡人）', async () => {
    const router = makeRouter()
    await loginAsWithCaps(null)
    await router.push('/workbench/crm')
    expect(router.currentRoute.value.path).toBe('/workbench/crm')
  })

  it('admin（all/all）不影响壳分流：控制台可达、工作台仍弹回', async () => {
    const adminRouter = makeRouter()
    await loginAsWithCaps({ role: 'admin', basis: 'x', resources: [cap('all', 'all')] })
    const store = useAuthStore()
    store.user = adminUser
    await adminRouter.push('/')
    expect(adminRouter.currentRoute.value.path).toBe('/')
    await adminRouter.push('/workbench')
    expect(adminRouter.currentRoute.value.path).toBe('/')
  })
})

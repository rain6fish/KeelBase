// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { PERMISSIONS } from '@/constants/permissions'

const mocks = vi.hoisted(() => ({ myPermissions: vi.fn() }))
vi.mock('@/api/auth', () => ({ authApi: { myPermissions: mocks.myPermissions } }))

describe('useAuthStore.hasPermission（渲染层权限点，WEB-FRONT-2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('admin（resources 含 all/all）→ 任意管理权限点 true', () => {
    const store = useAuthStore()
    store.permissions = { role: 'admin', basis: '管理员', resources: [{ subject: 'all', scope: 'all', reason: 'x' }] }
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(true)
    expect(store.hasPermission(PERMISSIONS.AUDIT_VIEW)).toBe(true)
    expect(store.hasPermission('unknown.point')).toBe(true)
  })

  it('user 仅有本人级资源（own）→ 管理权限点 false', () => {
    const store = useAuthStore()
    store.permissions = {
      role: 'user',
      basis: '普通用户',
      resources: [{ subject: 'User', scope: 'own', reason: '只能操作自己的数据' }],
    }
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(false)
    expect(store.hasPermission(PERMISSIONS.AUDIT_VIEW)).toBe(false)
  })

  it('user 对某 subject 有 all 级 → 对应权限点 true', () => {
    const store = useAuthStore()
    store.permissions = {
      role: 'user',
      basis: 'x',
      resources: [{ subject: 'User', scope: 'all', reason: 'x' }],
    }
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(true)
    expect(store.hasPermission(PERMISSIONS.AUDIT_VIEW)).toBe(false)
  })

  it('permissions 未加载 → 保守 false', () => {
    const store = useAuthStore()
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(false)
  })

  it('loadPermissions 拉取成功 → 填充权限', async () => {
    mocks.myPermissions.mockResolvedValue({
      role: 'admin',
      basis: 'x',
      resources: [{ subject: 'all', scope: 'all', reason: 'x' }],
    })
    const store = useAuthStore()
    await store.loadPermissions()
    expect(store.permissions?.role).toBe('admin')
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(true)
  })
})

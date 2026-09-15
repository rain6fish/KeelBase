// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { PERMISSIONS } from '@/constants/permissions'

const mocks = vi.hoisted(() => ({ myPermissions: vi.fn() }))
vi.mock('@/api/auth', () => ({ authApi: { myPermissions: mocks.myPermissions } }))

/** 能力项 fixture（wire schema：subject/scope/actions/reason） */
function cap(
  subject: string,
  scope: 'all' | 'own',
  actions: string[] = ['create', 'read', 'update', 'delete'],
) {
  return { subject, scope, actions, reason: 'x' }
}

describe('useAuthStore.hasPermission（渲染层权限点，WEB-FRONT-2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('admin（resources 含 all/all）→ 任意权限点 true（含未知点）', () => {
    const store = useAuthStore()
    store.permissions = { role: 'admin', basis: '管理员', resources: [cap('all', 'all')] }
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(true)
    expect(store.hasPermission(PERMISSIONS.CRM_VIEW)).toBe(true)
    expect(store.hasPermission('unknown.point')).toBe(true) // 全量能力 → 一律放行
  })

  it('user 仅本人级资源（User/own）→ 管理点 false', () => {
    const store = useAuthStore()
    store.permissions = { role: 'user', basis: '普通用户', resources: [cap('User', 'own')] }
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(false) // 需 User/all
    expect(store.hasPermission(PERMISSIONS.CRM_VIEW)).toBe(false) // 无 CrmCustomer
  })

  it('user 对某 subject 有匹配 scope → 对应点 true', () => {
    const store = useAuthStore()
    store.permissions = { role: 'user', basis: 'x', resources: [cap('CrmCustomer', 'own')] }
    expect(store.hasPermission(PERMISSIONS.CRM_VIEW)).toBe(true)
    expect(store.hasPermission(PERMISSIONS.PM_VIEW)).toBe(false)
  })

  it('scope 不匹配 → false', () => {
    const store = useAuthStore()
    store.permissions = { role: 'user', basis: 'x', resources: [cap('User', 'all')] }
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(true)
    expect(store.hasPermission(PERMISSIONS.TODO_MANAGE)).toBe(false) // 无 Todo
  })

  it('permissions 未加载 → 保守 false', () => {
    const store = useAuthStore()
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(false)
  })

  it('loadPermissions 拉取成功 → 填充权限并置 loaded', async () => {
    mocks.myPermissions.mockResolvedValue({ role: 'admin', basis: 'x', resources: [cap('all', 'all')] })
    const store = useAuthStore()
    await store.loadPermissions()
    expect(store.permissions?.role).toBe('admin')
    expect(store.permissionsLoaded).toBe(true)
    expect(store.hasPermission(PERMISSIONS.USER_MANAGE)).toBe(true)
  })

  it('已加载后不重复拉取；force=true 强制刷新', async () => {
    mocks.myPermissions.mockResolvedValue({ role: 'user', basis: 'x', resources: [] })
    const store = useAuthStore()
    await store.loadPermissions()
    await store.loadPermissions()
    expect(mocks.myPermissions).toHaveBeenCalledTimes(1)
    await store.loadPermissions(true)
    expect(mocks.myPermissions).toHaveBeenCalledTimes(2)
  })

  it('clearPermissions 清空（防跨用户脏授权）', async () => {
    mocks.myPermissions.mockResolvedValue({ role: 'admin', basis: 'x', resources: [cap('all', 'all')] })
    const store = useAuthStore()
    await store.loadPermissions()
    store.clearPermissions()
    expect(store.permissions).toBeNull()
    expect(store.permissionsLoaded).toBe(false)
  })

  it('加载失败 → permissions 保持 null 且不置 loaded', async () => {
    mocks.myPermissions.mockRejectedValue(new Error('boom'))
    const store = useAuthStore()
    await store.loadPermissions()
    expect(store.permissions).toBeNull()
    expect(store.permissionsLoaded).toBe(false)
  })
})

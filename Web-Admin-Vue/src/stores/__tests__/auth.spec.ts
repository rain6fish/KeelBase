import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthUser } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { storage } from '@/utils/storage'

const adminUser: AuthUser = { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin' }
const userUser: AuthUser = { id: 2, username: 'alex', email: 'alex@example.com', role: 'user' }

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/api/auth', () => ({ authApi: mocks }))

describe('useAuthStore 角色分流', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('admin 登录 → authenticated + isAdmin', async () => {
    mocks.login.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: adminUser })
    const store = useAuthStore()

    const ok = await store.login('admin', 'Admin@2026$KeelBase')

    expect(ok).toBe(true)
    expect(store.status).toBe('authenticated')
    expect(store.user).toEqual(adminUser)
    expect(store.isAdmin).toBe(true)
    expect(storage.readTokens().accessToken).toBe('at')
  })

  it('普通用户登录 → authenticated + 非 isAdmin', async () => {
    mocks.login.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: userUser })
    const store = useAuthStore()

    const ok = await store.login('alex', 'Alex@2026$Demo')

    expect(ok).toBe(true)
    expect(store.status).toBe('authenticated')
    expect(store.user).toEqual(userUser)
    expect(store.isAdmin).toBe(false)
  })

  it('tryAutoLogin 带 token 且 me 返回普通用户 → authenticated', async () => {
    storage.saveTokens('at', 'rt')
    mocks.me.mockResolvedValue(userUser)
    const store = useAuthStore()

    await store.tryAutoLogin()

    expect(store.status).toBe('authenticated')
    expect(store.user).toEqual(userUser)
    expect(store.isAdmin).toBe(false)
  })

  it('tryAutoLogin 无 token → unauthenticated', async () => {
    const store = useAuthStore()

    await store.tryAutoLogin()

    expect(store.status).toBe('unauthenticated')
    expect(store.user).toBeNull()
  })

  it('登录失败（抛错）→ unauthenticated + errorMessage', async () => {
    mocks.login.mockRejectedValue(new Error('认证失败'))
    const store = useAuthStore()

    const ok = await store.login('alex', 'wrong')

    expect(ok).toBe(false)
    expect(store.status).toBe('unauthenticated')
    expect(store.errorMessage).toBe('认证失败')
  })
})

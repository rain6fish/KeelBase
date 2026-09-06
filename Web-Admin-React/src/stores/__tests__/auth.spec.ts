// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuthStore, useIsAdmin } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'
import type { AuthUser, LoginResult } from '@/types/api'

vi.mock('@/api/auth', () => ({
  authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() },
}))

const loginMock = vi.mocked(authApi.login)
const meMock = vi.mocked(authApi.me)
const logoutMock = vi.mocked(authApi.logout)

const adminUser: AuthUser = { id: 1, username: 'root', email: 'root@example.com', role: 'admin' }
const userUser: AuthUser = { id: 2, username: 'alex', email: 'alex@example.com', role: 'user' }

function loginResultFor(u: AuthUser): LoginResult {
  return { accessToken: 'atk', refreshToken: 'rtk', user: u }
}

beforeEach(() => {
  localStorage.clear()
  loginMock.mockReset()
  meMock.mockReset()
  logoutMock.mockReset()
  useAuthStore.setState({ status: 'initial', user: null, errorMessage: '' })
})

describe('auth store', () => {
  it('starts in initial state with actions wired', () => {
    const s = useAuthStore.getState()
    expect(s.status).toBe('initial')
    expect(s.user).toBeNull()
    expect(s.errorMessage).toBe('')
    expect(typeof s.login).toBe('function')
    expect(typeof s.tryAutoLogin).toBe('function')
  })

  it('login success returns true and persists token pair + user', async () => {
    loginMock.mockResolvedValue(loginResultFor(adminUser))
    const ok = await useAuthStore.getState().login('root', 'pw')
    expect(ok).toBe(true)
    const s = useAuthStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.user?.role).toBe('admin')
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe('atk')
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('rtk')
  })

  it('login failure with an Error records its message and stays unauthenticated', async () => {
    loginMock.mockRejectedValue(new Error('wrong password'))
    const ok = await useAuthStore.getState().login('root', 'bad')
    expect(ok).toBe(false)
    const s = useAuthStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.user).toBeNull()
    expect(s.errorMessage).toBe('wrong password')
  })

  it('login failure with a non-Error falls back to the generic message', async () => {
    loginMock.mockRejectedValue('boom')
    await useAuthStore.getState().login('root', 'bad')
    expect(useAuthStore.getState().errorMessage).toBe('登录失败')
  })

  it('tryAutoLogin without a token skips the API call', async () => {
    await useAuthStore.getState().tryAutoLogin()
    expect(meMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('tryAutoLogin with a token authenticates via /me', async () => {
    storage.saveTokens('atk', 'rtk')
    meMock.mockResolvedValue(userUser)
    await useAuthStore.getState().tryAutoLogin()
    expect(meMock).toHaveBeenCalledTimes(1)
    const s = useAuthStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.user?.username).toBe('alex')
  })

  it('tryAutoLogin with a token but failed /me clears tokens', async () => {
    storage.saveTokens('atk', 'rtk')
    meMock.mockRejectedValue(new Error('401'))
    await useAuthStore.getState().tryAutoLogin()
    const s = useAuthStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.user).toBeNull()
    expect(storage.readTokens()).toEqual({ accessToken: '', refreshToken: '' })
  })

  it('logout clears tokens and state even when the API call fails (best-effort)', async () => {
    useAuthStore.setState({ status: 'authenticated', user: userUser })
    storage.saveTokens('atk', 'rtk')
    logoutMock.mockRejectedValue(new Error('net down'))
    await useAuthStore.getState().logout()
    const s = useAuthStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.user).toBeNull()
    expect(storage.readTokens()).toEqual({ accessToken: '', refreshToken: '' })
  })
})

describe('useIsAdmin selector', () => {
  it('is true for an admin role user', () => {
    useAuthStore.setState({ user: adminUser })
    const { result } = renderHook(() => useIsAdmin())
    expect(result.current).toBe(true)
  })

  it('is false for a regular user and for no user', () => {
    useAuthStore.setState({ user: userUser })
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false)
    useAuthStore.setState({ user: null })
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false)
  })
})

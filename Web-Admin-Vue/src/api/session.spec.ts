// SPDX-License-Identifier: Apache-2.0

/**
 * session.ts 单点刷新 adapter 测试（FE-1：client.ts 与 streamChat.ts 共用，崩了会静默回归）。
 * 覆盖：无 refreshToken 早退 / 成功轮换存双 token / 缺 token 不回真值 / 异常 → false / 并发 401 只发一次（stampede 防护）。
 * 用 vi.hoisted 保证 mock 实例与 session.ts 解析到的是同一个。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  readTokens: vi.fn(),
  saveTokens: vi.fn(),
}))

vi.mock('axios', () => ({ default: { post: mocks.post } }))
vi.mock('@/utils/storage', () => ({
  storage: { readTokens: mocks.readTokens, saveTokens: mocks.saveTokens },
}))

import { refreshAccessToken } from './session'

const envelope = (data: unknown) => ({ code: 200, message: 'ok', data, timestamp: 't' })

describe('refreshAccessToken（单点刷新 adapter）', () => {
  beforeEach(() => {
    mocks.post.mockReset()
    mocks.readTokens.mockReset()
    mocks.saveTokens.mockReset()
  })

  it('无 refreshToken → false，且不发起请求', async () => {
    mocks.readTokens.mockReturnValue({ accessToken: '', refreshToken: '' })
    await expect(refreshAccessToken()).resolves.toBe(false)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('成功轮换（200 + 双 token）→ true 并保存新 token 对', async () => {
    mocks.readTokens.mockReturnValue({ accessToken: 'old-a', refreshToken: 'old-r' })
    mocks.post.mockResolvedValue({ data: envelope({ accessToken: 'new-a', refreshToken: 'new-r' }) })

    await expect(refreshAccessToken()).resolves.toBe(true)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(String(mocks.post.mock.calls[0][0])).toContain('/auth/refresh')
    expect(mocks.post.mock.calls[0][1]).toEqual({ refreshToken: 'old-r' })
    expect(mocks.saveTokens).toHaveBeenCalledWith('new-a', 'new-r')
  })

  it('响应缺 token（不回真值）→ false，不保存', async () => {
    mocks.readTokens.mockReturnValue({ accessToken: 'a', refreshToken: 'r' })
    mocks.post.mockResolvedValue({ data: envelope({ accessToken: 'new-a' }) })

    await expect(refreshAccessToken()).resolves.toBe(false)
    expect(mocks.saveTokens).not.toHaveBeenCalled()
  })

  it('网络/服务端异常 → false（不抛出，调用方据此登出）', async () => {
    mocks.readTokens.mockReturnValue({ accessToken: 'a', refreshToken: 'r' })
    mocks.post.mockRejectedValue(new Error('403'))

    await expect(refreshAccessToken()).resolves.toBe(false)
    expect(mocks.saveTokens).not.toHaveBeenCalled()
  })

  it('并发 401 → 只发一次刷新请求（stampede 防护），两次调用同得 true', async () => {
    mocks.readTokens.mockReturnValue({ accessToken: 'a', refreshToken: 'r' })
    let resolvePost!: (v: unknown) => void
    mocks.post.mockReturnValue(new Promise((r) => { resolvePost = r }))

    const p1 = refreshAccessToken()
    const p2 = refreshAccessToken()
    expect(mocks.post).toHaveBeenCalledTimes(1) // 第二次复用共享 promise，未新发请求

    resolvePost({ data: envelope({ accessToken: 'n-a', refreshToken: 'n-r' }) })
    await expect(p1).resolves.toBe(true)
    await expect(p2).resolves.toBe(true)
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('失败后共享 promise 复位 → 后续可重试', async () => {
    mocks.readTokens.mockReturnValue({ accessToken: 'a', refreshToken: 'r' })
    mocks.post.mockRejectedValueOnce(new Error('boom'))
    await expect(refreshAccessToken()).resolves.toBe(false)

    mocks.post.mockResolvedValueOnce({ data: envelope({ accessToken: 'n-a', refreshToken: 'n-r' }) })
    await expect(refreshAccessToken()).resolves.toBe(true)
    expect(mocks.post).toHaveBeenCalledTimes(2)
  })
})

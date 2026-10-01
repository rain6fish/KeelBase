// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { adminAiChatMock, userAiChatMock } = vi.hoisted(() => ({
  adminAiChatMock: vi.fn(),
  userAiChatMock: vi.fn(),
}))
vi.mock('@/api/admin', () => ({ adminApi: { adminAiChat: adminAiChatMock } }))
vi.mock('@/api/ai', () => ({ aiApi: { chat: userAiChatMock } }))

import { shouldDelegate, sendDelegation, delegateTriggersForParity } from './agentDelegation'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('shouldDelegate（委托绕行判据）', () => {
  it('命中技能触发词 → 绕到非流式', () => {
    expect(shouldDelegate('周计划')).toBe(true)
    expect(shouldDelegate('帮我安排本周')).toBe(true)
    expect(shouldDelegate('把本周的日程盘一下')).toBe(false) // 「盘点」才命中；光有「盘」不算
    expect(shouldDelegate('盘点一下我的客户')).toBe(true)
  })

  it('含动作词的委托类消息仍留在流式：写操作的确认卡靠 confirmation_request 事件', () => {
    expect(shouldDelegate('创建本周计划')).toBe(false)
    expect(shouldDelegate('删除周安排')).toBe(false)
  })

  it('含导航词 → 留在流式', () => {
    expect(shouldDelegate('打开周计划')).toBe(false)
    expect(shouldDelegate('前往周安排')).toBe(false)
  })

  it('普通消息 → 留在流式', () => {
    expect(shouldDelegate('你好')).toBe(false)
    expect(shouldDelegate('本月有哪些事件')).toBe(false)
  })
})

describe('sendDelegation（按角色选端点）', () => {
  it('管理员 → /admin/ai/chat；普通用户 → /ai/chat', async () => {
    adminAiChatMock.mockResolvedValue({ reply: '管理端回答', conversationId: 'c1' })
    userAiChatMock.mockResolvedValue({ reply: '用户端回答', conversationId: 'c2' })

    expect(await sendDelegation({ text: '周计划', isAdmin: true })).toEqual({
      reply: '管理端回答',
      conversationId: 'c1',
    })
    expect(adminAiChatMock).toHaveBeenCalledWith({ message: '周计划', conversationId: undefined })
    expect(userAiChatMock).not.toHaveBeenCalled()

    expect(
      await sendDelegation({ text: '周计划', isAdmin: false, conversationId: 'c0' }),
    ).toEqual({ reply: '用户端回答', conversationId: 'c2' })
    expect(userAiChatMock).toHaveBeenCalledWith({ message: '周计划', conversationId: 'c0' })
  })
})

/**
 * 防**静默漂移**：本判据是服务端技能触发词的客户端副本（见模块头注）。服务端一旦新增触发词而
 * 客户端没跟上，控制台会不报错地失去委托能力——所以这里直接读服务端单源对账，让它变红。
 */
describe('与服务端技能触发词对账', () => {
  it('服务端每个技能触发词都必须在客户端清单里', () => {
    // 按 cwd（= Web-Admin-Vue，vitest 从本包跑）定位兄弟包；找不到会以 ENOENT 响亮失败
    const serverSource = resolve(
      process.cwd(),
      '../Server-NestJS/src/ai/skills/skills-registry.ts',
    )
    const src = readFileSync(serverSource, 'utf8')
    const keywords = [...src.matchAll(/triggerKeywords:\s*\[([^\]]*)\]/g)].flatMap((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((k) => k[1]),
    )
    // 防断言空转：正则若不再匹配（服务端改了写法），这条先红，而不是静默放过
    expect(keywords.length).toBeGreaterThan(0)

    const ours = delegateTriggersForParity()
    expect(keywords.filter((k) => !ours.includes(k))).toEqual([])
  })
})

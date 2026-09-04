// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { myEffectsMock, conversationsMock, revokeMock, pushMock } = vi.hoisted(() => ({
  myEffectsMock: vi.fn(),
  conversationsMock: vi.fn(),
  revokeMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('@/api/aiTrace', () => ({
  aiTraceApi: { myEffects: myEffectsMock, conversations: conversationsMock, revokeEffect: revokeMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import ElementPlus from 'element-plus'
import MyAiActionCenterView from '../MyAiActionCenterView.vue'

const effectExecuted = {
  id: 1,
  toolName: 'create_followup_task',
  conversationId: 'conv-1',
  resultType: 'crm_task',
  resultId: 42,
  createdAt: '2026-09-04T09:30:00Z',
  targetExists: true,
  targetSoftDeleted: false,
  targetTitle: '跟进：辰光建材 逾期回款',
  status: 'executed',
}
const effectRevoked = {
  id: 2,
  toolName: 'create_followup_task',
  conversationId: 'conv-1',
  resultType: 'crm_task',
  resultId: 43,
  createdAt: '2026-09-04T09:31:00Z',
  targetExists: true,
  targetSoftDeleted: true,
  targetTitle: '跟进：澄海地产',
  status: 'revoked',
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(MyAiActionCenterView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, AppIcon: true, AppPagination: true, ConfirmDialog: true, BusinessHistoryDrawer: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MyAiActionCenterView（AI Action Center 本人面）', () => {
  it('加载 AI 写副作用：显示人类标签 + 状态（已执行/已撤销）+ 撤销按钮仅 executed 显示', async () => {
    myEffectsMock.mockResolvedValue({ items: [effectExecuted, effectRevoked], total: 2, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(myEffectsMock).toHaveBeenCalledWith(1, 20)
    expect(wrapper.text()).toContain('创建跟进任务') // D2 toolLabel 人类标签
    expect(wrapper.text()).toContain('已执行')
    expect(wrapper.text()).toContain('已撤销')
    // 撤销按钮仅 executed 行出现（两条中 1 条）→ 只出现 1 次
    expect(wrapper.findAll('button').filter((b) => b.text().includes('撤销'))).toHaveLength(1)
    expect(wrapper.text()).toContain('跟进：辰光建材 逾期回款')
  })

  it('空写副作用 → 空态引导文案', async () => {
    myEffectsMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('还没有 AI 写操作')
  })

  it('加载失败 → 显示错误信息', async () => {
    myEffectsMock.mockRejectedValue(new Error('boom'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('boom')
  })

  it('「查看证据」→ 跳转 Business Action Detail（B4）', async () => {
    myEffectsMock.mockResolvedValue({ items: [effectExecuted], total: 1, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    const evidenceBtn = wrapper.findAll('button').find((b) => b.text().includes('查看证据'))!
    await evidenceBtn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'workbench-action-detail',
      params: { resultType: 'crm_task', resultId: '42' },
    })
  })

  it('最近 AI 会话模块渲染「打开轨迹」并可跳 AiTrace', async () => {
    myEffectsMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([
      { id: 'conv-1', provider: 'deepseek', model: 'deepseek-v4-flash', summary: null, createdAt: '2026-09-04T09:00:00Z', lastActivityAt: '2026-09-04T09:30:00Z', messages: [{ role: 'user', content: '查一下风险客户', timestamp: '2026-09-04T09:00:00Z' }] },
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('查一下风险客户')
    const openBtn = wrapper.findAll('button').find((b) => b.text().includes('打开轨迹'))!
    await openBtn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ path: '/workbench/ai-trace', query: { conv: 'conv-1' } })
  })
})

// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { myEffectsMock, conversationsMock, revokeMock, revokeConvMock, pushMock } = vi.hoisted(() => ({
  myEffectsMock: vi.fn(),
  conversationsMock: vi.fn(),
  revokeMock: vi.fn(),
  revokeConvMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('@/api/aiTrace', () => ({
  aiTraceApi: {
    myEffects: myEffectsMock,
    conversations: conversationsMock,
    revokeEffect: revokeMock,
    revokeConversationEffects: revokeConvMock,
  },
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
  revokeClass: 'local_compensate',
  revocable: true,
  change: { kind: 'created', fields: ['title', 'dueDate'] },
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
  revokeClass: 'local_compensate',
  revocable: false,
}
/** KB-6：governed_external 撤销后 = 外部撤销中（结果未知），禁显示"已撤销" */
const effectRevokingExternal = {
  id: 3,
  toolName: 'java_ext_order',
  conversationId: 'conv-1',
  resultType: 'proxy_call',
  resultId: 7,
  createdAt: '2026-09-04T09:32:00Z',
  targetExists: true,
  targetSoftDeleted: false,
  targetTitle: '外部系统写调用（B 路径）',
  status: 'revoking_external',
  revokeClass: 'governed_external',
  revokeStatus: 'compensating',
  revocable: false,
}
/** KB-6：revokeClass=none（不可撤）→ 即使 executed 也不显示撤销钮 */
const effectNotRevocable = {
  id: 4,
  toolName: 'external_write_no_path',
  conversationId: 'conv-1',
  resultType: 'proxy_call',
  resultId: 8,
  createdAt: '2026-09-04T09:33:00Z',
  targetExists: true,
  targetSoftDeleted: false,
  targetTitle: '外部系统写调用（B 路径）',
  status: 'executed',
  revokeClass: 'none',
  revocable: false,
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

  it('D2：显示实际状态变化摘要（新建 N 个字段）', async () => {
    myEffectsMock.mockResolvedValue({ items: [effectExecuted], total: 1, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('新建')
    expect(wrapper.text()).toContain('2') // 字段数
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

  it('KB-6: governed_external 撤销后 → 显示「外部撤销中」+ 补偿提示，禁显示「已撤销」且无撤销钮', async () => {
    myEffectsMock.mockResolvedValue({ items: [effectRevokingExternal], total: 1, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('外部撤销中')
    expect(wrapper.text()).toContain('补偿已请求')
    expect(wrapper.text()).not.toContain('已撤销')
    // 无撤销钮（已进入撤销流程）
    expect(wrapper.findAll('button').filter((b) => b.text().includes('撤销'))).toHaveLength(0)
  })

  it('KB-6: revokeClass=none（不可撤）→ executed 也不显示撤销钮', async () => {
    myEffectsMock.mockResolvedValue({ items: [effectNotRevocable], total: 1, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('已执行')
    expect(wrapper.findAll('button').filter((b) => b.text().includes('撤销'))).toHaveLength(0)
  })

  it('G1: 会话行提供「撤销本会话写操作」批量入口', async () => {
    myEffectsMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    conversationsMock.mockResolvedValue([
      { id: 'conv-x', messages: [{ role: 'user', content: '帮我改价格' }], lastActivityAt: '2026-09-01T00:00:00Z' },
    ])

    const wrapper = mountView()
    await flushPromises()

    const revokeConvBtns = wrapper.findAll('button').filter((b) => b.text().includes('撤销本会话写操作'))
    expect(revokeConvBtns).toHaveLength(1)
  })
})

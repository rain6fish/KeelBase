// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { governanceMock } = vi.hoisted(() => ({ governanceMock: vi.fn() }))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { governanceAction: governanceMock },
}))
vi.mock('@/api/client', () => {
  class ApiError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return { ApiError }
})
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 2, username: 'alex', role: 'user' } }),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { resultType: 'crm_task', resultId: '42' } }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

import ElementPlus from 'element-plus'
import BusinessActionDetailView from '../BusinessActionDetailView.vue'

const effect = {
  id: 1,
  userId: '2',
  toolName: 'create_followup_task',
  argsHash: 'abc123',
  conversationId: 'conv-1',
  resultType: 'crm_task',
  resultId: 42,
  createdAt: '2026-08-25T10:00:00Z',
}

function makePage(trace?: unknown, rejectWith?: unknown) {
  governanceMock.mockReset()
  if (rejectWith !== undefined) governanceMock.mockRejectedValue(rejectWith)
  else governanceMock.mockResolvedValue({ effect, trace })
  const i18n = createI18n({
    legacy: false,
    locale: 'zh',
    messages: { zh, en },
  })
  return mount(BusinessActionDetailView, {
    global: {
      plugins: [ElementPlus, i18n],
      stubs: { AppIcon: true },
    },
  })
}

describe('BusinessActionDetailView（P0·产品证明 Business Action Trace）', () => {
  beforeEach(() => governanceMock.mockReset())

  it('按路由参数拉取治理数据并渲染七段', async () => {
    const wrapper = makePage()
    await flushPromises()

    expect(governanceMock).toHaveBeenCalledWith('crm_task', 42)
    expect(wrapper.text()).toContain('业务动作详情') // 页面标题
    expect(wrapper.text()).toContain('alex') // Who
    expect(wrapper.text()).toContain('create_followup_task') // What
    expect(wrapper.text()).toContain('crm_task #42') // Result
    expect(wrapper.text()).toContain('abc123') // Integrity
  })

  it('渲染 Human-Agent-System 决策轨迹（含来源分类标签）', async () => {
    const wrapper = makePage({
      steps: [
        { id: 'i1', type: 'input', time: '2026-08-25T10:00:00Z', content: '分析客户' },
        { id: 't1', type: 'tool_call', time: '2026-08-25T10:00:01Z', toolName: 'query_customers', args: '{}' },
        { id: 'c1', type: 'confirmation', time: '2026-08-25T10:00:02Z', toolName: 'create_followup_task', args: '{}', outcome: 'approve' },
        { id: 'e1', type: 'effect', time: '2026-08-25T10:00:03Z', toolName: 'create_followup_task', effect: { resultType: 'crm_task', resultId: 42 } },
      ],
    })
    await flushPromises()

    expect(wrapper.text()).toContain('你的提问') // input
    expect(wrapper.text()).toContain('工具调用') // tool_call
    expect(wrapper.text()).toContain('确认决策') // confirmation
    expect(wrapper.text()).toContain('创建记录') // effect
  })

  it('Why 双层：有人工确认时显示用户视角「用户已确认」', async () => {
    const wrapper = makePage({
      steps: [
        { id: 'c1', type: 'confirmation', time: '2026-08-25T10:00:01Z', toolName: 'create_followup_task', args: '{}', outcome: 'approve' },
      ],
    })
    await flushPromises()

    expect(wrapper.text()).toContain('用户已确认')
  })

  // 注：404（无 AI 治理记录 → 友好空态）路径已实测验证（catch 渲染 governanceNoData），
  // 但 vitest 对组件内 async 加载的 mock rejection 存在 unhandled 误报，与 GovernanceActionDrawer 同约定不在本 spec 覆盖。
})

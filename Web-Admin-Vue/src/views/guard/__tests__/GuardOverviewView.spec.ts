// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { agentsMock, toolsMock, approvalsMock, reportMock, snackMock, pushMock } = vi.hoisted(() => ({
  agentsMock: vi.fn(),
  toolsMock: vi.fn(),
  approvalsMock: vi.fn(),
  reportMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  pushMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { agents: agentsMock, tools: toolsMock, approvals: approvalsMock },
}))
vi.mock('@/api/audit', () => ({
  auditApi: { actionReport: reportMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { defineComponent } from 'vue'
import ElementPlus from 'element-plus'
import GuardOverviewView from '../GuardOverviewView.vue'

// PageHeader stub 透传默认槽，暴露「刷新」按钮可驱动
const PageHeaderStub = defineComponent({ template: '<div><slot /></div>' })

const agents = [
  { id: 1, name: 'sales-agent', trustLevel: 'R3', capabilities: '["query_customers"]', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  { id: 2, name: 'audit-agent', trustLevel: 'R1', capabilities: '[]', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
]

const tools = [
  { name: 'query_customers', description: '', parameters: [], enabled: true, requiresConfirmation: false, allowedRoles: ['user'], riskLevel: 'R1' },
  { name: 'create_event', description: '', parameters: [], enabled: true, requiresConfirmation: true, allowedRoles: ['user'], riskLevel: 'R3' },
  { name: 'update_credit_limit', description: '', parameters: [], enabled: true, requiresConfirmation: false, allowedRoles: ['approver'], riskLevel: 'R5' },
]

const approvals = [
  { id: 1, token: 'tok-1', toolName: 'update_credit_limit', args: '{"customerId":7,"amount":50000}', operatorId: '2', riskLevel: 'R4', status: 'pending', createdAt: '2026-09-01T09:00:00Z' },
]

const report = {
  period: { since: null, to: '' },
  summary: { executed: 4, approved: 1, rejected: 1, blocked: 2, errors: 1, effects: 1 },
  byAction: [],
  byDay: [{ date: '2026-09-01T00:00:00.000Z', executed: 4, approved: 1, rejected: 1, blocked: 2, errors: 1 }],
  hashChain: { valid: true, checked: 5, brokenIndex: null },
  samples: [],
}

const emptyReport = {
  period: { since: null, to: '' },
  summary: { executed: 0, approved: 0, rejected: 0, blocked: 0, errors: 0, effects: 0 },
  byAction: [],
  byDay: [],
  hashChain: { valid: true, checked: 0, brokenIndex: null },
  samples: [],
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(GuardOverviewView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  agentsMock.mockResolvedValue(agents)
  toolsMock.mockResolvedValue(tools)
  approvalsMock.mockResolvedValue(approvals)
  reportMock.mockResolvedValue(report)
})

describe('GuardOverviewView（治理总览）', () => {
  it('挂载 → 并行拉 agents/tools/approvals/action-report 并渲染审批与哈希链状态', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(agentsMock).toHaveBeenCalledTimes(1)
    expect(toolsMock).toHaveBeenCalledTimes(1)
    expect(approvalsMock).toHaveBeenCalledTimes(1)
    expect(reportMock).toHaveBeenCalledTimes(1)

    // 五中心统计卡标签
    expect(wrapper.text()).toContain('Agent 注册表')
    expect(wrapper.text()).toContain('策略中心')
    // 风险分布出现 R5
    expect(wrapper.text()).toContain('R5')
    // 待人工审批行：工具名渲染
    expect(wrapper.text()).toContain('update_credit_limit')
    // 审计态势：哈希链有效（report.hashChain.valid）+ summary 批准段
    expect(wrapper.text()).toContain('审计哈希链有效')
    expect(wrapper.text()).toContain('人工批准')
  })

  it('加载失败 → snackbar.error 提示错误信息，不抛错', async () => {
    agentsMock.mockRejectedValue(new Error('治理台不可用'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('治理台不可用')
    expect(wrapper.exists()).toBe(true)
  })

  it('空数据 → 渲染 noData 占位且审批卡隐藏', async () => {
    agentsMock.mockResolvedValue([])
    toolsMock.mockResolvedValue([])
    approvalsMock.mockResolvedValue([])
    reportMock.mockResolvedValue(emptyReport)

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无数据')
    expect(wrapper.text()).not.toContain('update_credit_limit')
    // 统计卡仍渲染（审计态势卡存在，空时无审批行卡片）
    expect(wrapper.text()).toContain('Agent 注册表')
  })

  it('点击统计卡 → 跳转对应中心路由', async () => {
    const wrapper = mountView()
    await flushPromises()

    const agentCard = wrapper.findAll('.stat-card').find((c) => c.text().includes('Agent 注册表'))
    expect(agentCard).toBeTruthy()
    await agentCard!.trigger('click')

    expect(pushMock).toHaveBeenCalledWith('/agent-registry')
  })
})

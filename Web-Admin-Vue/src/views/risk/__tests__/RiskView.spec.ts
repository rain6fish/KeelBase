// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { toolsMock, reportMock, logsMock, snackMock, pushMock } = vi.hoisted(() => ({
  toolsMock: vi.fn(),
  reportMock: vi.fn(),
  logsMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  pushMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { tools: toolsMock },
}))
vi.mock('@/api/audit', () => ({
  auditApi: { actionReport: reportMock, logs: logsMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { defineComponent } from 'vue'
import ElementPlus from 'element-plus'
import RiskView from '../RiskView.vue'

// PageHeader stub 透传默认槽，暴露「刷新」按钮可驱动
const PageHeaderStub = defineComponent({ template: '<div><slot /></div>' })

const tools = [
  { name: 'query_customers', description: '', parameters: [], enabled: true, requiresConfirmation: false, allowedRoles: ['user'], riskLevel: 'R1' },
  { name: 'create_event', description: '', parameters: [], enabled: true, requiresConfirmation: true, allowedRoles: ['user'], riskLevel: 'R3' },
  { name: 'update_credit_limit', description: '', parameters: [], enabled: true, requiresConfirmation: false, allowedRoles: ['approver'], riskLevel: 'R5' },
]

const emptyReport = {
  period: { since: null, to: '' },
  summary: { executed: 0, approved: 0, rejected: 0, blocked: 0, errors: 0, effects: 0 },
  byAction: [],
  byDay: [],
  hashChain: { valid: true, checked: 0, brokenIndex: null },
  samples: [],
}

// byDay：近 7 天趋势桶（date 升序，slice(-7) 取尾 7）
const report = {
  period: { since: null, to: '' },
  summary: { executed: 4, approved: 1, rejected: 1, blocked: 2, errors: 1, effects: 1 },
  byAction: [],
  byDay: [{ date: '2026-09-01T00:00:00.000Z', executed: 4, approved: 1, rejected: 1, blocked: 2, errors: 1 }],
  hashChain: { valid: true, checked: 5, brokenIndex: null },
  samples: [],
}

const riskLogs = [
  { id: 1, userId: '2', action: 'create_event', isError: true, errorMessage: '无权访问：越权尝试', authorization: '[{"name":"ownership","ok":false,"note":"不是本人资源"}]', createdAt: '2026-09-01T08:00:00Z' },
  { id: 2, userId: '2', action: 'send_email', isError: false, authorization: '[{"name":"allowed","ok":true}]', createdAt: '2026-09-01T09:00:00Z' },
]

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(RiskView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  toolsMock.mockResolvedValue(tools)
  reportMock.mockResolvedValue(report)
  logsMock.mockResolvedValue(riskLogs)
})

describe('RiskView（风险中心）', () => {
  it('挂载 → 并行拉工具/action-report/审计日志并渲染分布与风险操作', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(toolsMock).toHaveBeenCalledTimes(1)
    expect(reportMock).toHaveBeenCalledTimes(1)
    expect(logsMock).toHaveBeenCalledWith({ limit: 100 })

    // 统计卡 + 风险分布行（R5/R3/R1 均有工具）
    expect(wrapper.text()).toContain('工具总数')
    expect(wrapper.text()).toContain('R5')
    expect(wrapper.text()).toContain('R3')
    // 最近风险操作：isError 越权 → 「AI 越权尝试」；仅带 authorization 非 error → 「风险告警」
    expect(wrapper.text()).toContain('AI 越权尝试')
    expect(wrapper.text()).toContain('风险告警')
    // 趋势标题出现（report 非空）
    expect(wrapper.text()).toContain('AI 执行')
  })

  it('加载失败 → snackbar.error 提示错误信息，不抛错', async () => {
    toolsMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('网络错误')
    expect(wrapper.exists()).toBe(true)
  })

  it('空数据 → 渲染 noData 占位', async () => {
    toolsMock.mockResolvedValue([])
    reportMock.mockResolvedValue(emptyReport)
    logsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无数据')
    expect(wrapper.text()).not.toContain('AI 越权尝试')
  })

  it('点击「刷新」→ 重新 loadAll（三 API 各再次调用）', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(toolsMock).toHaveBeenCalledTimes(1)

    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('刷新'))
    expect(refreshBtn).toBeTruthy()
    await refreshBtn!.trigger('click')
    await flushPromises()

    expect(toolsMock).toHaveBeenCalledTimes(2)
    expect(logsMock).toHaveBeenCalledTimes(2)
    expect(reportMock).toHaveBeenCalledTimes(2)
  })
})

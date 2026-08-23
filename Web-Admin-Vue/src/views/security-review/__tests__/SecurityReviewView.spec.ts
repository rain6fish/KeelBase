import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { logsMock, verifyMock, toolsMock, policyMock, reportMock } = vi.hoisted(() => ({
  logsMock: vi.fn(),
  verifyMock: vi.fn(),
  toolsMock: vi.fn(),
  policyMock: vi.fn(),
  reportMock: vi.fn(),
}))

vi.mock('@/api/audit', () => ({
  auditApi: { logs: logsMock, verify: verifyMock },
}))
vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { tools: toolsMock, policy: policyMock },
}))
vi.mock('@/api/aiEval', () => ({
  aiEvalApi: { report: reportMock },
}))

import ElementPlus from 'element-plus'
import SecurityReviewView from '../SecurityReviewView.vue'

const AppTableStub = defineComponent({
  name: 'AppTable',
  props: ['headers', 'items', 'loading'],
  template:
    '<div class="app-table-stub"><template v-for="item in items" :key="item.id"><slot name="item.detail" :item="item" /><slot name="item.reason" :item="item" /></template></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(SecurityReviewView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: AppTableStub,
        StatusChip: true,
        AppIcon: true,
        // Trace tab 复用工作台 AiTraceView，本页聚焦四层视图，直接 stub
        AiTraceView: true,
      },
    },
  })
}

const riskLog = {
  id: 1,
  userId: 'u1',
  username: 'alex',
  action: 'create_event',
  detail: 'create_event({"title":"越权"})',
  isError: true,
  authorization: JSON.stringify([{ name: 'ownership', ok: false, note: '不是本人资源' }]),
  createdAt: '2026-08-21T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SecurityReviewView', () => {
  it('挂载 → 并行加载 Review/Security/Posture 三块数据', async () => {
    logsMock.mockResolvedValue([riskLog])
    verifyMock.mockResolvedValue({ valid: true, total: 10 })
    toolsMock.mockResolvedValue([
      { name: 'create_event', description: 'x', parameters: [], enabled: true, requiresConfirmation: true, allowedRoles: ['user'], riskLevel: 'R3', permissions: null },
    ])
    policyMock.mockResolvedValue('{"tools":{},"audit":{"granularity":"all"}}')
    reportMock.mockResolvedValue({ ranAt: '', total: 4, passed: 3, failed: 1, timedOut: 0, byAssert: {}, cases: [] })

    mountView()
    await flushPromises()

    expect(logsMock).toHaveBeenCalledWith({ limit: 50 })
    expect(toolsMock).toHaveBeenCalledTimes(1)
    expect(reportMock).toHaveBeenCalledTimes(1)
    expect(policyMock).toHaveBeenCalledTimes(1)
    expect(verifyMock).toHaveBeenCalledTimes(1)
  })

  it('Review tab → 过滤出风险操作并渲染结构化拒绝原因', async () => {
    logsMock.mockResolvedValue([riskLog])
    verifyMock.mockResolvedValue({ valid: true })
    toolsMock.mockResolvedValue([])
    policyMock.mockResolvedValue(undefined)
    reportMock.mockResolvedValue(null)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.el-tabs__item')[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('create_event')
    expect(wrapper.text()).toContain('不是本人资源')
  })

  it('Security tab → 渲染工具风险分布 + 评测报告', async () => {
    logsMock.mockResolvedValue([])
    verifyMock.mockResolvedValue({ valid: true })
    toolsMock.mockResolvedValue([
      { name: 'create_event', description: 'x', parameters: [], enabled: true, requiresConfirmation: true, allowedRoles: ['user'], riskLevel: 'R5', permissions: null },
      { name: 'create_todo', description: 'y', parameters: [], enabled: true, requiresConfirmation: true, allowedRoles: ['user'], riskLevel: 'R3', permissions: null },
    ])
    policyMock.mockResolvedValue(undefined)
    reportMock.mockResolvedValue({ ranAt: '', total: 4, passed: 3, failed: 1, timedOut: 0, byAssert: {}, cases: [] })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.el-tabs__item')[2].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('阻断')
    expect(wrapper.text()).toContain('需确认')
    expect(wrapper.text()).toContain('3/4')
  })

  it('Posture tab → 渲染治理策略 + 审计链状态', async () => {
    logsMock.mockResolvedValue([])
    verifyMock.mockResolvedValue({ valid: true, total: 10 })
    toolsMock.mockResolvedValue([])
    policyMock.mockResolvedValue('{"audit":{"granularity":"write"}}')
    reportMock.mockResolvedValue(null)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.el-tabs__item')[3].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('"granularity"')
    expect(wrapper.text()).toContain('哈希链完整可验证')
  })
})

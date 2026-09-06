// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { detailMock, analyzeMock, snackMock, useRouteMock } = vi.hoisted(() => ({
  detailMock: vi.fn(),
  analyzeMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  useRouteMock: vi.fn(),
}))

vi.mock('@/api/crm', () => ({
  crmApi: { detail: detailMock, analyze: analyzeMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
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
vi.mock('vue-router', () => ({
  useRoute: () => useRouteMock(),
}))

import ElementPlus from 'element-plus'
import { ApiError } from '@/api/client'
import CrmCustomerDetailView from '../CrmCustomerDetailView.vue'

// PageHeader stub：渲染 title/subtitle + 透传默认槽（头部操作按钮可驱动）
const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="ph-stub"><div class="ph-title">{{ title }}</div><div v-if="subtitle" class="ph-subtitle">{{ subtitle }}</div><slot /></div>',
})

const customer = {
  id: 1,
  name: 'Acme 科技',
  company: 'Acme Inc',
  email: 'ops@acme.com',
  phone: '13800000000',
  status: 'active',
  riskLevel: 'medium',
  notes: '重点客户',
}
const detailFull = {
  customer,
  orders: [{ id: 1, customerId: 1, amount: 450000, status: 'paid', orderDate: '2026-08-01' }],
  activities: [{ id: 1, customerId: 1, type: 'call', summary: '电话沟通续约' }],
  tasks: [{ id: 1, customerId: 1, title: '跟进续约报价', status: 'pending' }],
  risks: [{ id: 1, customerId: 1, level: 'high', reason: '回款逾期' }],
}
const detailMinimal = {
  customer: { ...customer, company: null, email: null, phone: null, notes: null },
  orders: [],
  activities: [],
  tasks: [],
  risks: [],
}

function mountView() {
  useRouteMock.mockReturnValue({ params: { id: '1' }, query: {} })
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(CrmCustomerDetailView, {
    global: {
      plugins: [i18n, ElementPlus],
      // 重型抽屉在挂载时无需驱动；stub 以聚焦页面本身
      stubs: { PageHeader: PageHeaderStub, AppIcon: true, CrmCopilotDrawer: true, GovernanceActionDrawer: true, BusinessHistoryDrawer: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CrmCustomerDetailView（AI CRM 客户详情）', () => {
  it('挂载 → 按路由 id 拉取详情并渲染客户/订单/任务/风险', async () => {
    detailMock.mockResolvedValue(detailFull)

    const wrapper = mountView()
    await flushPromises()

    expect(detailMock).toHaveBeenCalledTimes(1)
    expect(detailMock).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('Acme 科技') // PageHeader 标题 = 客户名
    expect(wrapper.text()).toContain('Acme Inc')
    expect(wrapper.text()).toContain('13800000000')
    expect(wrapper.text()).toContain('重点客户')
    expect(wrapper.text()).toContain('合作中') // 状态标签
    expect(wrapper.text()).toContain('450000') // 订单金额
    expect(wrapper.text()).toContain('电话沟通续约')
    expect(wrapper.text()).toContain('跟进续约报价')
    expect(wrapper.text()).toContain('回款逾期') // 风险 reason
    expect(wrapper.text()).toContain('高') // 风险等级标签
  })

  it('403（他人数据越权）→ snackbar 提示无权访问该客户', async () => {
    detailMock.mockRejectedValue(new ApiError('Forbidden', 403))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('无权访问该客户')
    expect(wrapper.text()).toContain('客户管理') // 标题回落
    expect(wrapper.exists()).toBe(true)
  })

  it('加载失败 → snackbar 加载失败，不抛错', async () => {
    detailMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('加载失败')
    expect(wrapper.exists()).toBe(true)
  })

  it('风险分析 → 调 analyze(id) + 成功提示 + 渲染风险理由', async () => {
    detailMock.mockResolvedValue(detailMinimal)
    analyzeMock.mockResolvedValue({ level: 'critical', score: 9, reasons: ['客户负债率高企'] })

    const wrapper = mountView()
    await flushPromises()

    const analyzeBtn = wrapper.findAll('button').find((b) => b.text().includes('风险分析'))
    expect(analyzeBtn).toBeTruthy()
    await analyzeBtn!.trigger('click')
    await flushPromises()

    expect(analyzeMock).toHaveBeenCalledWith(1)
    expect(snackMock.success).toHaveBeenCalledWith('分析完成')
    expect(wrapper.text()).toContain('客户负债率高企')
  })
})

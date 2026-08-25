import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { dashboardMock, errorMock } = vi.hoisted(() => ({
  dashboardMock: vi.fn(),
  errorMock: vi.fn(),
}))

vi.mock('@/api/crm', () => ({
  crmApi: { dashboard: dashboardMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock }),
}))

import ElementPlus from 'element-plus'
import CrmDashboardView from '../CrmDashboardView.vue'

const base = {
  customers: 8, highRiskCustomers: 2, opportunities: 3, pipelineAmount: 1200000,
  weightedAmount: 720000, soonClosing: 1, overdueOrders: 2, openTasks: 5, openRisks: 3,
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(CrmDashboardView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, StatCard: true },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('CrmDashboardView（P0 AI Intelligence Dashboard）', () => {
  it('挂载 → 调 /crm/dashboard + 渲染建议动作', async () => {
    dashboardMock.mockResolvedValue(base)
    const wrapper = mountView()
    await flushPromises()

    expect(dashboardMock).toHaveBeenCalled()
    expect(wrapper.text()).toContain('AI 建议动作')
  })

  it('渲染 AI 建议动作（高风险客户 / 逾期订单 / 即将成交 / 未解决风险）', async () => {
    dashboardMock.mockResolvedValue(base)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('AI 建议动作')
    expect(wrapper.text()).toContain('有 2 个高风险客户')
    expect(wrapper.text()).toContain('有 2 笔逾期订单')
    expect(wrapper.text()).toContain('有 1 个商机 30 天内将成交')
    expect(wrapper.text()).toContain('有 3 个未解决风险')
  })

  it('全零 → 显示「一切正常」', async () => {
    dashboardMock.mockResolvedValue({ ...base, highRiskCustomers: 0, overdueOrders: 0, soonClosing: 0, openRisks: 0, openTasks: 0 })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('一切正常')
  })

  it('加载失败 → snackbar.error', async () => {
    dashboardMock.mockRejectedValue(new Error('网络错误'))
    mountView()
    await flushPromises()
    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })
})

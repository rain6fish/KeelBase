import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

// vi.mock 工厂被 hoist，mock 变量必须用 vi.hoisted 定义（否则 ReferenceError）
const { overviewMock, statsMock } = vi.hoisted(() => ({
  overviewMock: vi.fn(),
  statsMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({ adminApi: { overview: overviewMock } }))
vi.mock('@/api/audit', () => ({ auditApi: { stats: statsMock } }))

import ElementPlus from 'element-plus'
import DashboardView from '../DashboardView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(DashboardView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, StatCard: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DashboardView', () => {
  it('加载成功 → 渲染统计卡片与趋势柱状图', async () => {
    overviewMock.mockResolvedValue({
      counts: { users: 12, events: 5, notifications: 3, aiAuditLogs: 8 },
      storage: { driver: 'local', bytes: 1024 },
      trend: [
        { date: '2026-08-18', count: 2 },
        { date: '2026-08-19', count: 5 },
      ],
    })
    statsMock.mockResolvedValue({ topActions: [{ action: 'LOGIN', count: 9 }] })

    const wrapper = mountView()
    await flushPromises()

    // 4 张统计卡（stub StatCard 不渲染 label，但 el-row/el-col 结构在）
    expect(wrapper.findAll('.el-col').length).toBeGreaterThanOrEqual(4)
    // 趋势柱状条渲染
    expect(wrapper.findAll('div[style*="height"]').length).toBeGreaterThan(0)
    expect(overviewMock).toHaveBeenCalledWith(7)
    expect(statsMock).toHaveBeenCalled()
  })

  it('空数据 → 显示无趋势空态', async () => {
    overviewMock.mockResolvedValue({
      counts: {},
      storage: { driver: '-', bytes: null },
      trend: [],
    })
    statsMock.mockResolvedValue({ topActions: [] })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无趋势数据')
  })

  it('API 失败 → 不抛错（全局 snackbar 处理）', async () => {
    overviewMock.mockRejectedValue(new Error('boom'))

    const wrapper = mountView()
    await flushPromises()

    // 静默降级：不渲染趋势，无异常
    expect(wrapper.text()).not.toContain('boom')
  })
})

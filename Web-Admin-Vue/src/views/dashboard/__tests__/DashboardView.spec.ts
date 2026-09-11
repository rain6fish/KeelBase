// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

// vi.mock 工厂被 hoist，mock 变量必须用 vi.hoisted 定义（否则 ReferenceError）
const { overviewMock, statsMock, journeyStatsMock, apiGetMock } = vi.hoisted(() => ({
  overviewMock: vi.fn(),
  statsMock: vi.fn(),
  journeyStatsMock: vi.fn(),
  apiGetMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({ adminApi: { overview: overviewMock } }))
vi.mock('@/api/audit', () => ({ auditApi: { stats: statsMock } }))
vi.mock('@/api/ai', () => ({ aiApi: { trustSandboxJourneyStats: journeyStatsMock } }))
vi.mock('@/api/client', () => ({ api: { get: apiGetMock } }))

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
  journeyStatsMock.mockResolvedValue({ today: 0, total: 0, todayDate: '' })
  // 就绪清单默认返回空维（多数用例只关心概览；专用用例再覆盖）
  apiGetMock.mockResolvedValue({ ready: true, checkedAt: '', dimensions: {} })
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
    // P2③ admin 可看：Trust 旅程统计卡
    expect(journeyStatsMock).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Trust 之旅')
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

  it('NC-3 就绪清单：渲染五维 + 每维状态与可执行下一步', async () => {
    overviewMock.mockResolvedValue({ counts: {}, storage: { driver: 'local', bytes: null }, trend: [] })
    statsMock.mockResolvedValue({ topActions: [] })
    apiGetMock.mockResolvedValue({
      ready: false,
      checkedAt: '2026-09-11T00:00:00Z',
      dimensions: {
        runtime: { ready: true, detail: 'KeelBase v1.0.9', nextStep: null },
        db: { ready: true, detail: '数据库连接正常（better-sqlite3）', nextStep: null },
        ai: { ready: false, detail: '未配置真实模型', nextStep: '设置 DEEPSEEK_API_KEY' },
        governance: { ready: true, detail: '默认治理策略', nextStep: null },
        demo: { ready: false, detail: '演示数据未种（可选）', nextStep: 'npm run seed:demo' },
      },
    })

    const wrapper = mountView()
    await flushPromises()

    expect(apiGetMock).toHaveBeenCalledWith('/app/readiness')
    const text = wrapper.text()
    // 五维标签齐（zh）
    for (const label of ['运行时', '数据库', 'AI 模型', '治理', '演示数据']) {
      expect(text).toContain(label)
    }
    // 未就绪维的下一步可执行命令如实呈现（不藏）
    expect(text).toContain('设置 DEEPSEEK_API_KEY')
    expect(text).toContain('npm run seed:demo')
    // 核心未就绪 → 顶部状态标为「待配置」
    expect(text).toContain('待配置')
  })

  it('NC-3 就绪清单：端点失败 → 卡片整体隐藏（不阻塞概览）', async () => {
    overviewMock.mockResolvedValue({ counts: {}, storage: { driver: 'local', bytes: null }, trend: [] })
    statsMock.mockResolvedValue({ topActions: [] })
    apiGetMock.mockRejectedValue(new Error('nope'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('首次运行就绪')
  })
})

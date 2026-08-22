import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { analyticsMock } = vi.hoisted(() => ({
  analyticsMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: { analytics: analyticsMock },
}))

import ElementPlus from 'element-plus'
import AnalyticsView from '../AnalyticsView.vue'

function sample() {
  return {
    period: { days: 30 },
    activeUsers: { daily: [{ date: '2026-08-21', count: 5 }], wau: 10, mau: 20, totalUsers: 100 },
    retention: { ratePct: 50, retained: 50, activeLast30d: 100 },
    featureFunnel: [{ action: 'login', count: 99 }],
    errors: { aiErrors: 2, trend: [{ date: '2026-08-21', count: 1 }] },
  }
}

// PageHeader stub：渲染默认插槽（天数切换 el-select 在插槽内）
const PageHeaderStub = { name: 'PageHeader', props: ['title', 'subtitle'], template: '<div><slot /></div>' }

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AnalyticsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, StatCard: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AnalyticsView', () => {
  it('挂载 → 调用 adminApi.analytics(30) 加载默认 30 天统计', async () => {
    analyticsMock.mockResolvedValue(sample())

    const wrapper = mountView()
    await flushPromises()

    expect(analyticsMock).toHaveBeenCalledWith(30)
    // 加载完成后渲染数据区域（含 StatCard）
    expect(wrapper.findComponent({ name: 'StatCard' }).exists()).toBe(true)
  })

  it('切换天数 → 携带新 days 重新加载', async () => {
    analyticsMock.mockResolvedValue(sample())

    const wrapper = mountView()
    await flushPromises()
    expect(analyticsMock).toHaveBeenCalledTimes(1)

    // 触发 el-select 更新 modelValue → days=7 + load()
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 7)
    await flushPromises()

    expect(analyticsMock).toHaveBeenLastCalledWith(7)
  })

  it('加载失败 → 静默降级不抛错', async () => {
    analyticsMock.mockRejectedValue(new Error('analytics down'))

    const wrapper = mountView()
    await flushPromises()

    // catch 静默（全局 snackbar 处理），页面不崩溃
    expect(wrapper.exists()).toBe(true)
  })
})

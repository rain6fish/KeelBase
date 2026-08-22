import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { opsSummaryMock } = vi.hoisted(() => ({
  opsSummaryMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: { opsSummary: opsSummaryMock },
}))

import ElementPlus from 'element-plus'
import OpsView from '../OpsView.vue'

function sample() {
  return {
    alerts: [],
    metrics: { requestRateRps: 3.2, errorRatePct: 0.1, latencyP95Ms: 120, inFlight: 4 },
    logErrors: { since: '2026-08-21T10:00:00Z', opErrors: [], aiErrors: 0 },
    trend: [{ day: '2026-08-20', total: 100, errors: 1 }],
  }
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(OpsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, StatCard: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OpsView', () => {
  it('挂载 → 调用 adminApi.opsSummary() 获取运维摘要', async () => {
    opsSummaryMock.mockResolvedValue(sample())

    const wrapper = mountView()
    await flushPromises()

    expect(opsSummaryMock).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'StatCard' }).exists()).toBe(true)
  })

  it('加载失败 → 显示错误 + 点击重试重新加载', async () => {
    opsSummaryMock.mockRejectedValueOnce(new Error('ops down')).mockResolvedValueOnce(sample())

    const wrapper = mountView()
    await flushPromises()

    expect(opsSummaryMock).toHaveBeenCalledTimes(1)
    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('重试'))
    expect(retryBtn).toBeTruthy()

    await retryBtn!.trigger('click')
    await flushPromises()

    expect(opsSummaryMock).toHaveBeenCalledTimes(2)
  })
})

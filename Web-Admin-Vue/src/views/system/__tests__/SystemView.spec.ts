import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { appVersionMock, monitorSummaryMock } = vi.hoisted(() => ({
  appVersionMock: vi.fn(),
  monitorSummaryMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: {
    appVersion: appVersionMock,
    monitorSummary: monitorSummaryMock,
  },
}))

import ElementPlus from 'element-plus'
import SystemView from '../SystemView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(SystemView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SystemView', () => {
  it('挂载 → 并行调用 appVersion + monitorSummary 并渲染', async () => {
    appVersionMock.mockResolvedValue({
      latestVersion: '1.2.0',
      minRequiredVersion: '1.0.0',
      updateUrl: '',
      changelog: ['修复登录', '新增 MFA'],
    })
    monitorSummaryMock.mockResolvedValue({
      health: { status: 'ok', uptimeSec: 3660, nodeEnv: 'production', version: '1.2.0' },
      dependencies: { database: 'postgres', redis: 'connected', queue: 'ready', storage: 'local', mail: 'smtp', push: 'none' },
      counts: {},
      metrics: {},
    })

    const wrapper = mountView()
    await flushPromises()

    expect(appVersionMock).toHaveBeenCalledTimes(1)
    expect(monitorSummaryMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('1.2.0')
    expect(wrapper.text()).toContain('production')
    expect(wrapper.text()).toContain('1h 1m 0s') // formatUptime(3661)
  })

  it('接口失败 → 静默（页面保持加载占位，不抛错）', async () => {
    appVersionMock.mockRejectedValue(new Error('boom'))
    monitorSummaryMock.mockRejectedValue(new Error('boom'))

    const wrapper = mountView()
    await flushPromises()

    expect(appVersionMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toBeTruthy()
  })
})

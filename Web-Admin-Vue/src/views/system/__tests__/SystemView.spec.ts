// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { appVersionMock, monitorSummaryMock, provenanceMock } = vi.hoisted(() => ({
  appVersionMock: vi.fn(),
  monitorSummaryMock: vi.fn(),
  provenanceMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: {
    appVersion: appVersionMock,
    monitorSummary: monitorSummaryMock,
  },
}))

vi.mock('@/api/provenance', () => ({
  provenanceApi: { get: provenanceMock },
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

  it('FE-1：渲染运行时来源指纹（/app/provenance）', async () => {
    appVersionMock.mockResolvedValue({ latestVersion: '1.2.0', minRequiredVersion: '1.0.0', updateUrl: '', changelog: [] })
    monitorSummaryMock.mockResolvedValue({
      health: { status: 'ok', uptimeSec: 0, nodeEnv: 'production', version: '1.2.0' },
      dependencies: { database: 'postgres', redis: 'connected', queue: 'ready', storage: 'local', mail: 'smtp', push: 'none' },
      counts: {},
      metrics: {},
    })
    provenanceMock.mockResolvedValue({
      source: { manifestPresent: true, identity: 'keelbase-application', generator: 'keelbase', generatorVersion: '0.9.1', protocol: '1.0' },
      runtime: { preset: 'full', businessModules: [{ id: 'crm', label: '客户管理' }], aiToolFingerprint: { total: 20, read: 12, write: 8, byRisk: {} } },
    })

    const wrapper = mountView()
    await flushPromises()

    expect(provenanceMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('keelbase-application')
    expect(wrapper.text()).toContain('客户管理')
    expect(wrapper.text()).toContain('20') // 工具总数
  })

  it('接口失败 → 静默（页面保持加载占位，不抛错）', async () => {
    appVersionMock.mockRejectedValue(new Error('boom'))
    monitorSummaryMock.mockRejectedValue(new Error('boom'))
    provenanceMock.mockRejectedValue(new Error('boom'))

    const wrapper = mountView()
    await flushPromises()

    expect(appVersionMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toBeTruthy()
  })
})

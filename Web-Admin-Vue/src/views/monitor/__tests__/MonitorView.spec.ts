// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { monitorMock } = vi.hoisted(() => ({
  monitorMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: { monitorSummary: monitorMock },
}))

import ElementPlus from 'element-plus'
import MonitorView from '../MonitorView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(MonitorView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, StatCard: true, StatusChip: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MonitorView', () => {
  it('挂载 → 调用 adminApi.monitorSummary 获取监控摘要', async () => {
    monitorMock.mockResolvedValue({ health: { status: 'ok' }, requestRateRps: 3.2 })

    const wrapper = mountView()
    await flushPromises()

    expect(monitorMock).toHaveBeenCalledTimes(1)
    wrapper.unmount() // 清理轮询定时器（onUnmounted）
  })

  it('加载失败 → 静默降级不抛错', async () => {
    monitorMock.mockRejectedValue(new Error('monitor down'))

    const wrapper = mountView()
    await flushPromises()

    // catch 静默（全局 snackbar 处理），页面不崩溃
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

import ElementPlus from 'element-plus'
import ObservabilityView from '../ObservabilityView.vue'

const openMock = vi.fn()

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(ObservabilityView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  openMock.mockReset()
  vi.stubGlobal('open', openMock)
})

describe('ObservabilityView', () => {
  it('渲染 Grafana / Prometheus / Jaeger / Loki 四个可观测性入口', () => {
    const wrapper = mountView()

    const text = wrapper.text()
    expect(text).toContain('Grafana')
    expect(text).toContain('Prometheus')
    expect(text).toContain('Jaeger')
    expect(text).toContain('Loki')
    expect(text).toContain('http://localhost:3001')
    expect(text).toContain('http://localhost:9090')
    expect(text).toContain('http://localhost:16686')
    expect(text).toContain('http://localhost:3100')
  })

  it('点击系统卡片 → 新窗口打开对应 URL', async () => {
    const wrapper = mountView()

    const prometheusCard = wrapper
      .findAll('.el-card')
      .find((c) => c.text().includes('Prometheus'))
    expect(prometheusCard).toBeTruthy()

    await prometheusCard!.trigger('click')
    expect(openMock).toHaveBeenCalledWith('http://localhost:9090', '_blank')
  })
})

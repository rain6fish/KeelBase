// SPDX-License-Identifier: Apache-2.0

/**
 * BA 异常行为告警页（docs/ai-behavior-baseline.spec.md §7）单元测试。
 * 重点：告警必须把**可复算依据**显示出来（数了多少 / 阈值多少 / 样本行号）——
 * 没有依据的告警不可辩驳，那正是本能力存在的意义。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { alertsMock, ackMock } = vi.hoisted(() => ({ alertsMock: vi.fn(), ackMock: vi.fn() }))

vi.mock('@/api/admin', () => ({
  adminApi: { behaviorAlerts: alertsMock, acknowledgeBehaviorAlert: ackMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import ElementPlus from 'element-plus'
import AiBehaviorView from '../AiBehaviorView.vue'

const row = {
  id: 1,
  rule: 'R-2',
  level: 'critical',
  subject: { kind: 'user', id: '7' },
  conversationId: 'c1',
  title: '高危工具被拒后反复尝试',
  detail: '10 分钟内 6 次调用 delete_customer 均未成功，超过阈值 3',
  evidence: { count: 6, threshold: 3, windowMinutes: 10, sampleRowIds: [11, 12], toolName: 'delete_customer' },
  status: 'open',
  createdAt: '2026-09-18T03:15:00.000Z',
  decidedAt: null,
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiBehaviorView, {
    global: { plugins: [i18n, ElementPlus], stubs: { PageHeader: true, AppIcon: true } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  alertsMock.mockResolvedValue([])
})

describe('AiBehaviorView（BA 异常行为告警）', () => {
  it('渲染告警：级别 + 规则 + **可复算依据**（计数/阈值/窗口/工具/样本行号）', async () => {
    alertsMock.mockResolvedValue([row])

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('高危工具被拒后反复尝试')
    expect(wrapper.text()).toContain('严重')
    expect(wrapper.text()).toContain('R-2')
    expect(wrapper.text()).toContain('6 / 3')
    expect(wrapper.text()).toContain('delete_customer')
    expect(wrapper.text()).toContain('11, 12')
  })

  it('空态', async () => {
    alertsMock.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无异常告警')
  })

  it('默认只查**未处理**——处理完的告警不该继续占版面', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(alertsMock).toHaveBeenCalledWith('open')
    expect(wrapper.text()).toContain('未处理')
    expect(wrapper.text()).toContain('全部')
  })

  it('标记已处理 → 调接口；已处理的项不再给按钮', async () => {
    alertsMock.mockResolvedValue([row])
    ackMock.mockResolvedValue({ ok: true })

    const wrapper = mountView()
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('标记已处理'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(ackMock).toHaveBeenCalledWith(1)

    alertsMock.mockResolvedValue([{ ...row, status: 'acknowledged' }])
    const wrapper2 = mountView()
    await flushPromises()
    expect(wrapper2.text()).toContain('已处理')
    expect(wrapper2.findAll('button').some((b) => b.text().includes('标记已处理'))).toBe(false)
  })
})

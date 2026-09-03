// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import SecurityShowcaseView from '../SecurityShowcaseView.vue'

const { scenariosMock, runMock } = vi.hoisted(() => ({
  scenariosMock: vi.fn(),
  runMock: vi.fn(),
}))

vi.mock('@/api/securityShowcase', () => ({
  securityShowcaseApi: { scenarios: scenariosMock, run: runMock },
}))

import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'

vi.mock('@/components/PageHeader.vue', () => ({
  default: { props: ['title', 'subtitle'], template: '<div><slot /></div>' },
}))
vi.mock('@/components/AppIcon.vue', () => ({
  default: { props: ['icon'], template: '<i />' },
}))

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(SecurityShowcaseView, {
    global: { plugins: [i18n, ElementPlus, createPinia()] },
  })
}

describe('SecurityShowcaseView（A2 对抗性证明产品化）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染 4 个对抗场景卡片', async () => {
    scenariosMock.mockResolvedValue([
      { id: 'injection', category: 'injection' },
      { id: 'unauthorized', category: 'unauthorized' },
      { id: 'r5-block', category: 'risk' },
      { id: 'confirmation', category: 'confirmation' },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('.scenario-card').length).toBe(4)
    expect(wrapper.text()).toContain('提示注入拒绝')
    expect(wrapper.text()).toContain('跨用户越权拒绝')
  })

  it('运行演示 → 显示结果徽章 + 本地化 reason + 决策轨迹（4 步）', async () => {
    scenariosMock.mockResolvedValue([{ id: 'injection', category: 'injection' }])
    runMock.mockResolvedValue({
      scenarioId: 'injection',
      outcome: 'refused',
      reasonKey: 'injection.reason',
      reasonParams: { feature: 'prompt_injection' },
      trace: [
        { step: 'input', key: 'injection.input' },
        { step: 'guard', key: 'injection.guardHit', params: { feature: 'prompt_injection' } },
        { step: 'decision', key: 'injection.decision' },
        { step: 'outcome', key: 'injection.outcome' },
      ],
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(runMock).toHaveBeenCalledWith('injection')
    expect(wrapper.text()).toContain('已拒绝')
    // reason/detail 走前端 i18n（后端不产用户可见文案），不再渲染后端原始字符串
    expect(wrapper.text()).toContain('HS-8 注入防线命中注入特征')
    expect(wrapper.findAll('.el-timeline-item').length).toBe(4)
  })

  it('运行失败（防线漂移 fail-loud）→ 弹出错误提示而非无反馈', async () => {
    scenariosMock.mockResolvedValue([{ id: 'injection', category: 'injection' }])
    runMock.mockRejectedValue(new Error('Security showcase drift: injection sample was not flagged'))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(runMock).toHaveBeenCalledWith('injection')
    // ElMessage 渲染到 body（teleport），断言全局可见的错误提示
    expect(document.body.textContent).toContain('Security showcase drift')
    document.body.querySelectorAll('.el-message').forEach((n) => n.remove())
  })

  it('场景清单加载失败 → 不误显空态', async () => {
    scenariosMock.mockRejectedValue(new Error('network'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('暂无对抗场景')
    expect(wrapper.findAll('.scenario-card').length).toBe(0)
  })
})

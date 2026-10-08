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

/** 嵌套消息对象的叶子路径（`a.b`），供逐条编译。 */
function leafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leafKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('SecurityShowcaseView（A2 对抗性证明产品化）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * 文案里的**字面花括号**会被 vue-i18n 当成插值占位符，编译失败只在控制台吭一声、页面照常渲染，
   * 于是缺陷静默通过一切「文本包含」断言。这条把「编译无错」本身钉住：任一新文案带了未转义的
   * `{...}`，这里就红。
   */
  it('showcase 全部 i18n 消息可编译（zh + en，无插值语法错误）', () => {
    const compilations: unknown[] = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...a) => compilations.push(a))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => compilations.push(a))
    try {
      for (const [locale, messages] of Object.entries({ zh, en })) {
        const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
        for (const section of ['scenarioCategory', 'scenarioTitle', 'scenarioDesc', 'scenarioPrompt', 'outcome', 'step', 'scReason', 'scStep']) {
          for (const key of leafKeys((messages as Record<string, unknown>)[section] as Record<string, unknown>)) {
            i18n.global.t(`${section}.${key}`, { tool: 'x', level: 'x', feature: 'x' })
          }
        }
      }
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
    expect(compilations).toEqual([])

    // 编译通过还不够：转义要**渲染成字面花括号**，而不是被吃掉
    const zhI18n = createI18n({ legacy: false, locale: 'zh', messages: { zh } })
    expect(String(zhI18n.global.t('scenarioPrompt.unknown-tool'))).toBe(
      '模型输出工具调用：“delete_all_customers({ reason: 清库 })”',
    )
    expect(String(zhI18n.global.t('scStep.unauthorized.decision'))).toBe(
      "subject('CrmCustomer', {userId:1}) → 拒绝",
    )
  })

  it('渲染 5 个对抗场景卡片', async () => {
    scenariosMock.mockResolvedValue([
      { id: 'injection', category: 'injection' },
      { id: 'unauthorized', category: 'unauthorized' },
      { id: 'r5-block', category: 'risk' },
      { id: 'confirmation', category: 'confirmation' },
      { id: 'unknown-tool', category: 'hallucination' },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('.scenario-card').length).toBe(5)
    expect(wrapper.text()).toContain('提示注入拒绝')
    expect(wrapper.text()).toContain('跨用户越权拒绝')
    // 新场景：标题取自 i18n（键缺了会渲染成 key 本身，故这条同时钉住双语键存在）
    expect(wrapper.text()).toContain('不存在的工具拒绝')
    expect(wrapper.text()).toContain('模型幻觉')
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

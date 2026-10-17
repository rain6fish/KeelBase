// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

const injectionResult = {
  scenarioId: 'injection',
  outcome: 'refused',
  reasonKey: 'injection.reason',
  reasonParams: { feature: 'prompt_injection' },
  invariantKey: 'invariant.injection',
  trace: [
    { step: 'input', key: 'injection.input', verdict: 'info' },
    {
      step: 'guard',
      key: 'injection.guardHit',
      params: { feature: 'prompt_injection' },
      verdict: 'deny',
      basisKey: 'basis.injection.hit',
      basisParams: { feature: 'prompt_injection' },
      evidence: { detector: 'detectInjection', feature: 'prompt_injection' },
    },
    {
      step: 'decision',
      key: 'injection.decision',
      verdict: 'deny',
      basisKey: 'basis.injection.decision',
      evidence: { treatedAs: 'data', executedAsInstruction: false },
    },
    {
      step: 'outcome',
      key: 'injection.outcome',
      verdict: 'deny',
      evidence: { executed: false },
    },
  ],
}

describe('SecurityShowcaseView（A2 对抗性证明产品化 · 交互重放）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.querySelectorAll('.el-message').forEach((n) => n.remove())
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
        for (const section of [
          'scenarioCategory',
          'scenarioTitle',
          'scenarioDesc',
          'scenarioPrompt',
          'outcome',
          'step',
          'scReason',
          'scStep',
          'invariant',
          'basis',
          'verdict',
        ]) {
          for (const key of leafKeys((messages as Record<string, unknown>)[section] as Record<string, unknown>)) {
            i18n.global.t(`${section}.${key}`, { tool: 'x', level: 'x', feature: 'x', revokeClass: 'x' })
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

  it('渲染 6 个对抗场景卡片（含撤销）', async () => {
    scenariosMock.mockResolvedValue([
      { id: 'injection', category: 'injection' },
      { id: 'unauthorized', category: 'unauthorized' },
      { id: 'r5-block', category: 'risk' },
      { id: 'confirmation', category: 'confirmation' },
      { id: 'unknown-tool', category: 'hallucination' },
      { id: 'revoke', category: 'revoke' },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('.scenario-card').length).toBe(6)
    expect(wrapper.text()).toContain('提示注入拒绝')
    expect(wrapper.text()).toContain('跨用户越权拒绝')
    expect(wrapper.text()).toContain('不存在的工具拒绝')
    // 新场景：标题取自 i18n（键缺了会渲染成 key 本身，故这条同时钉住双语键存在）
    expect(wrapper.text()).toContain('AI 副作用撤销（本人作用域）')
    expect(wrapper.text()).toContain('撤销')
  })

  it('运行后先显示第 1 步；「直接看全部」展示 4 步 + 服务端判定/依据/读数 + 为什么安全', async () => {
    scenariosMock.mockResolvedValue([{ id: 'injection', category: 'injection' }])
    runMock.mockResolvedValue(injectionResult)

    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(runMock).toHaveBeenCalledWith('injection')
    // 交互重放：结果一到只揭示第一步，其余按时间线逐步展开
    expect(wrapper.findAll('.el-timeline-item').length).toBe(1)
    expect(wrapper.text()).toContain('1 / 4 步')

    await wrapper.find('.replay-show-all').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.el-timeline-item').length).toBe(4)
    expect(wrapper.text()).toContain('已拒绝')
    // verdict / basis / evidence 都是服务端返回的字段，前端只做双语渲染
    expect(wrapper.text()).toContain('治理判定')
    expect(wrapper.text()).toContain('依据')
    expect(wrapper.text()).toContain('detectInjection 命中')
    expect(wrapper.text()).toContain('feature=prompt_injection')
    expect(wrapper.text()).toContain('服务端读数')
    // 结果级叙事：为什么安全 + 依据
    expect(wrapper.text()).toContain('为什么这是安全的')
    expect(wrapper.text()).toContain('外部内容永远只是数据')
    expect(wrapper.text()).toContain('HS-8 注入防线命中注入特征')
  })

  it('自动重放：每 800ms 揭示一步；暂停后不再前进，继续后恢复', async () => {
    vi.useFakeTimers()
    scenariosMock.mockResolvedValue([{ id: 'injection', category: 'injection' }])
    runMock.mockResolvedValue(injectionResult)

    const wrapper = mountView()
    await vi.advanceTimersByTimeAsync(0) // 让 onMounted 的 scenarios() 微任务落地
    await wrapper.find('button').trigger('click')
    await vi.advanceTimersByTimeAsync(0) // 让 run() 微任务落地并启动重放

    expect(wrapper.findAll('.el-timeline-item').length).toBe(1)

    await vi.advanceTimersByTimeAsync(800)
    expect(wrapper.findAll('.el-timeline-item').length).toBe(2)

    // 暂停：计时器被清掉，时间再走也不前进
    await wrapper.find('.replay-toggle').trigger('click')
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.findAll('.el-timeline-item').length).toBe(2)

    // 继续：恢复自动播放，走完剩下两步
    await wrapper.find('.replay-toggle').trigger('click')
    await vi.advanceTimersByTimeAsync(1600)
    expect(wrapper.findAll('.el-timeline-item').length).toBe(4)
    expect(wrapper.text()).toContain('为什么这是安全的')
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
  })

  it('场景清单加载失败 → 不误显空态', async () => {
    scenariosMock.mockRejectedValue(new Error('network'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('暂无对抗场景')
    expect(wrapper.findAll('.scenario-card').length).toBe(0)
  })
})

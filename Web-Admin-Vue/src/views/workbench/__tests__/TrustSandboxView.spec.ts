// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { runMock, journeyMock, pushMock, routeState } = vi.hoisted(() => ({
  runMock: vi.fn(),
  journeyMock: vi.fn(),
  pushMock: vi.fn(),
  routeState: { query: {} as Record<string, string> },
}))

vi.mock('@/api/ai', () => ({
  aiApi: { trustSandboxRun: runMock, trustSandboxJourney: journeyMock },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => routeState,
}))

import ElementPlus from 'element-plus'
import TrustSandboxView from '../TrustSandboxView.vue'

// PageHeader stub：渲染 title/subtitle 与默认槽
const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="ph-stub"><div class="ph-title">{{ title }}</div><div v-if="subtitle" class="ph-subtitle">{{ subtitle }}</div><slot /></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(TrustSandboxView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, AppIcon: true },
    },
  })
}

function runButtons(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAll('button').filter((b) => b.text().includes('运行演示'))
}

/** 结果弹窗（测试环境 el-dialog 内联渲染于组件树内；未打开时无该节点） */
function resultDialog(wrapper: ReturnType<typeof mountView>) {
  return wrapper.find('.el-dialog')
}

function journeyStepsPayload() {
  return {
    journey: 'trust' as const,
    steps: [
      { step: 'ask' as const, scenario: 's1_normal', outcome: 'passed' as const, detail: '风险等级 critical（评分 12）', conversationId: 'conv-ask', resultType: 'crm_customer', resultId: 42 },
      { step: 'act' as const, scenario: 's4_confirm', outcome: 'passed' as const, detail: '写工具触发确认门控（R3）', requiresConfirmation: true },
      { step: 'break_deny' as const, scenario: 's2_denied', outcome: 'passed' as const, detail: 'bob 访问客户 #9 被拒' },
      { step: 'break_block' as const, scenario: 's3_r5_block', outcome: 'passed' as const, detail: 'delete_customer blocked (R5)', conversationId: 'conv-block' },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  routeState.query = {}
})

afterEach(() => {
  document.body.querySelectorAll('.el-message, .el-overlay').forEach((n) => n.remove())
})

describe('TrustSandboxView（Trust 沙盘）', () => {
  it('挂载 → 渲染六场景卡 + 「开始 3 分钟体验」，不弹结果弹窗', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Trust 沙盘')
    expect(wrapper.text()).toContain('每个场景以你的身份真实运行')
    expect(wrapper.text()).toContain('AI 分析真实客户风险') // s1
    expect(wrapper.text()).toContain('写操作需人工确认') // s4
    expect(wrapper.text()).toContain('存量 Java 系统接入') // s6
    expect(runButtons(wrapper).length).toBe(6)
    expect(wrapper.findAll('button').some((b) => b.text().includes('开始 3 分钟体验'))).toBe(true)
    expect(runMock).not.toHaveBeenCalled()
    expect(journeyMock).not.toHaveBeenCalled()
    expect(resultDialog(wrapper).exists()).toBe(false)
    wrapper.unmount()
  })

  it('运行演示 → 弹窗展示结果(outcome/detail/对话留痕)，可跳治理详情', async () => {
    runMock.mockResolvedValue({
      scenario: 's1_normal',
      outcome: 'passed',
      detail: '未发现越权或高风险行为',
      conversationId: 'conv-s1',
      resultType: 'crm_customer',
      resultId: 42,
    })

    const wrapper = mountView()
    await flushPromises()

    const buttons = runButtons(wrapper)
    await buttons[0].trigger('click')
    await flushPromises()

    expect(runMock).toHaveBeenCalledWith('s1_normal')
    const dlg = resultDialog(wrapper)
    expect(dlg.exists()).toBe(true)
    const text = dlg.text()
    expect(text).toContain('运行结果')
    expect(text).toContain('AI 分析真实客户风险') // 场景名
    expect(text).toContain('通过') // outcome 标签
    expect(text).toContain('未发现越权或高风险行为')
    expect(text).toContain('已产生对话留痕')
    expect(text).toContain('关闭')

    const viewBtn = dlg.findAll('button').find((b) => b.text().includes('查看业务动作治理详情'))
    expect(viewBtn).toBeTruthy()
    await viewBtn!.trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith('/workbench/action/crm_customer/42')

    wrapper.unmount()
  })

  it('运行演示(带 conversationId) → 弹窗「查看执行轨迹」直达 ?conv= 深链', async () => {
    runMock.mockResolvedValue({
      scenario: 's3_r5_block',
      outcome: 'passed',
      detail: 'AI 尝试删除客户被阻断（R5）',
      conversationId: 'conv-s3',
    })

    const wrapper = mountView()
    await flushPromises()

    const buttons = runButtons(wrapper)
    await buttons[2].trigger('click')
    await flushPromises()

    const dlg = resultDialog(wrapper)
    expect(dlg.exists()).toBe(true)
    const traceBtn = dlg.findAll('button').find((b) => b.text().includes('查看执行轨迹'))
    expect(traceBtn).toBeTruthy()
    await traceBtn!.trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith('/workbench/ai-trace?conv=conv-s3')
    wrapper.unmount()
  })

  it('P0-2 一键连跑：开始 → 四步逐条推进，跳过动画后完成，可直达执行轨迹', async () => {
    journeyMock.mockResolvedValue(journeyStepsPayload())

    const wrapper = mountView()
    await flushPromises()

    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('开始 3 分钟体验'))
    await startBtn!.trigger('click')
    await flushPromises()

    expect(journeyMock).toHaveBeenCalled()
    // 弹窗打开，首步已展示
    const dlg = wrapper.findAll('.el-dialog').find((d) => d.text().includes('旅程完成') || d.text().includes('① Ask'))
    expect(dlg).toBeTruthy()
    expect(dlg!.text()).toContain('① Ask')

    // 跳过动画 → 四步全部展示 + 完成态
    const skipBtn = wrapper.findAll('button').find((b) => b.text().includes('跳过动画'))
    expect(skipBtn).toBeTruthy()
    await skipBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.ts-journey-step').length).toBe(4)
    expect(wrapper.text()).toContain('旅程完成')
    const traceBtn = wrapper.findAll('button').find((b) => b.text().includes('查看执行轨迹'))
    expect(traceBtn).toBeTruthy()
    await traceBtn!.trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith('/workbench/ai-trace?conv=conv-ask')

    wrapper.unmount()
  })

  it('P0-2 ?journey=1 落地 → 自动开始一键连跑', async () => {
    journeyMock.mockResolvedValue(journeyStepsPayload())
    routeState.query = { journey: '1' }

    const wrapper = mountView()
    await flushPromises()

    expect(journeyMock).toHaveBeenCalled()
    expect(wrapper.text()).toContain('① Ask')
    wrapper.unmount()
  })

  it('P1-1 旅程完成 → 「从看到做」引导可跳真实 Copilot 与我的 AI 行为', async () => {
    journeyMock.mockResolvedValue(journeyStepsPayload())

    const wrapper = mountView()
    await flushPromises()

    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('开始 3 分钟体验'))
    await startBtn!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('跳过动画'))!.trigger('click')
    await flushPromises()

    // 引导（P1-1）：真落库目标 = ask 步刚建的沙盘客户（resultId 42）
    expect(wrapper.text()).toContain('从看到做')
    const liveBtn = wrapper.findAll('button').find((b) => b.text().includes('打开真实 AI 助手'))
    expect(liveBtn).toBeTruthy()
    await liveBtn!.trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith('/workbench/crm/42?ai=1')

    // 再跑一次 → 「我的 AI 行为」撤销/证据入口
    await wrapper.findAll('button').find((b) => b.text().includes('再跑一次'))!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('跳过动画'))!.trigger('click')
    await flushPromises()
    const actBtn = wrapper.findAll('button').find((b) => b.text().includes('我的 AI 行为'))
    expect(actBtn).toBeTruthy()
    await actBtn!.trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenLastCalledWith('/workbench/my-ai-actions')

    wrapper.unmount()
  })

  it('P2 轻埋点：旅程完成 → 本机完成次数 +1 并展示', async () => {
    journeyMock.mockResolvedValue(journeyStepsPayload())
    localStorage.removeItem('trust_journey_stats')

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('开始 3 分钟体验'))!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('跳过动画'))!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('已在本机完成旅程 1 次')
    expect(JSON.parse(localStorage.getItem('trust_journey_stats') ?? '{}').completed).toBe(1)
    localStorage.removeItem('trust_journey_stats')
    wrapper.unmount()
  })

  it('无 resultType/resultId 的场景（如 s6 Java 指引）→ 弹窗不显示治理详情入口', async () => {
    runMock.mockResolvedValue({ scenario: 's6_java', outcome: 'guide', detail: 'Java 存量系统接入说明' })

    const wrapper = mountView()
    await flushPromises()

    const buttons = runButtons(wrapper)
    await buttons[5].trigger('click')
    await flushPromises()

    const dlg = resultDialog(wrapper)
    expect(dlg.exists()).toBe(true)
    expect(dlg.text()).toContain('指引')
    expect(dlg.text()).not.toContain('查看业务动作治理详情')
    wrapper.unmount()
  })

  it('运行失败 → ElMessage 弹出错误，不弹结果弹窗（fail-loud，页面不挂死）', async () => {
    runMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    const buttons = runButtons(wrapper)
    await buttons[0].trigger('click')
    await flushPromises()

    expect(runMock).toHaveBeenCalledWith('s1_normal')
    expect(document.body.textContent).toContain('网络错误')
    expect(resultDialog(wrapper).exists()).toBe(false)
    expect(wrapper.findAll('button').length).toBeGreaterThan(0) // 页面仍可用（running 已复位）
    wrapper.unmount()
  })
})

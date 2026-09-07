// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { runMock, pushMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('@/api/ai', () => ({
  aiApi: { trustSandboxRun: runMock },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import ElementPlus from 'element-plus'
import TrustSandboxView from '../TrustSandboxView.vue'

// PageHeader stub：渲染 title/subtitle
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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  document.body.querySelectorAll('.el-message, .el-overlay').forEach((n) => n.remove())
})

describe('TrustSandboxView（Trust 沙盘）', () => {
  it('挂载 → 渲染六场景卡（标题/副标题/运行按钮），不弹结果弹窗', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Trust 沙盘')
    expect(wrapper.text()).toContain('每个场景以你的身份真实运行')
    expect(wrapper.text()).toContain('AI 分析真实客户风险') // s1
    expect(wrapper.text()).toContain('写操作需人工确认') // s4
    expect(wrapper.text()).toContain('存量 Java 系统接入') // s6
    expect(runButtons(wrapper).length).toBe(6)
    // 挂载不触发任何 API，也不显示弹窗
    expect(runMock).not.toHaveBeenCalled()
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

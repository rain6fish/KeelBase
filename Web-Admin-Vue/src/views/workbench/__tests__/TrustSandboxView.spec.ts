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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  // ElMessage 渲染到 body（teleport），逐个用例清理防串扰
  document.body.querySelectorAll('.el-message').forEach((n) => n.remove())
})

describe('TrustSandboxView（Trust 沙盘）', () => {
  it('挂载 → 渲染六场景卡（标题/副标题/运行按钮）', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Trust 沙盘')
    expect(wrapper.text()).toContain('每个场景以你的身份真实运行')
    expect(wrapper.text()).toContain('AI 分析真实客户风险') // s1
    expect(wrapper.text()).toContain('写操作需人工确认') // s4
    expect(wrapper.text()).toContain('存量 Java 系统接入') // s6
    expect(runButtons(wrapper).length).toBe(6)
    // 挂载不触发任何 API
    expect(runMock).not.toHaveBeenCalled()
  })

  it('运行演示 → trustSandboxRun(id) + 渲染结果(outcome/detail/对话留痕)，可跳治理详情', async () => {
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
    expect(wrapper.text()).toContain('运行结果')
    expect(wrapper.text()).toContain('通过') // outcome 标签
    expect(wrapper.text()).toContain('未发现越权或高风险行为')
    expect(wrapper.text()).toContain('已产生对话留痕')

    const viewBtn = wrapper.findAll('button').find((b) => b.text().includes('查看业务动作治理详情'))
    expect(viewBtn).toBeTruthy()
    await viewBtn!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/workbench/action/crm_customer/42')
  })

  it('运行失败 → ElMessage 弹出错误（fail-loud，页面不挂死）', async () => {
    runMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    const buttons = runButtons(wrapper)
    await buttons[0].trigger('click')
    await flushPromises()

    expect(runMock).toHaveBeenCalledWith('s1_normal')
    expect(document.body.textContent).toContain('网络错误')
    expect(wrapper.findAll('button').length).toBeGreaterThan(0) // 页面仍可用（running 已复位）
  })
})

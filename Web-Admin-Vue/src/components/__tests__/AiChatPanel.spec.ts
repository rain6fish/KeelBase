// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import { useAuthStore } from '@/stores/auth'

// vi.mock 会被提升到 import 之前，故桩必须走 vi.hoisted
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  list: vi.fn(),
  rename: vi.fn(),
  streamChat: vi.fn(),
  confirmTool: vi.fn(),
  crmCustomers: vi.fn(),
  crmAnalyze: vi.fn(),
  crmCreateTask: vi.fn(),
  pmProjects: vi.fn(),
  pmAnalyze: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/api/admin', () => ({
  adminApi: {
    aiConversations: (...a: unknown[]) => mocks.list(...a),
    aiConversation: vi.fn(),
    deleteAiConversation: vi.fn(),
    renameAiConversation: (...a: unknown[]) => mocks.rename(...a),
  },
}))
vi.mock('@/api/capabilities', () => ({ capabilitiesApi: { get: vi.fn().mockResolvedValue({}) } }))
vi.mock('@/api/crm', () => ({
  crmApi: {
    customers: (...a: unknown[]) => mocks.crmCustomers(...a),
    analyze: (...a: unknown[]) => mocks.crmAnalyze(...a),
    createTask: (...a: unknown[]) => mocks.crmCreateTask(...a),
  },
}))
vi.mock('@/api/pm', () => ({
  pmApi: { projects: (...a: unknown[]) => mocks.pmProjects(...a), analyze: (...a: unknown[]) => mocks.pmAnalyze(...a) },
}))
vi.mock('@/utils/streamChat', () => ({
  streamChat: mocks.streamChat,
  confirmTool: mocks.confirmTool,
}))

import AiChatPanel from '../AiChatPanel.vue'

/** 一段会话：未设 title，能考出「回退到首条 user 消息」 */
const conv = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  messageCount: 6,
  lastActivityAt: new Date().toISOString(),
  messages: [
    { role: 'user', content: '本月有哪些事件？', timestamp: new Date().toISOString() },
    { role: 'assistant', content: '你有 3 个事件。', timestamp: new Date().toISOString() },
  ],
  ...over,
})

async function mountPanel(rows: unknown[], locale: 'zh' | 'en' = 'zh') {
  mocks.list.mockResolvedValue(rows)
  const i18n = createI18n({ legacy: false, locale, messages: { zh, en } })
  const wrapper = mount(AiChatPanel, { global: { plugins: [ElementPlus, i18n] } })
  await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh()
  await flushPromises()
  return wrapper
}

async function mountLedger(rows: unknown[]) {
  const wrapper = await mountPanel(rows)
  // 切到账本视图（头部「聊天历史」按钮）
  const historyBtn = wrapper.findAll('button').find((b) => b.attributes('title') === '聊天历史')
  await historyBtn!.trigger('click')
  await flushPromises()
  return wrapper
}

function rowButton(wrapper: ReturnType<typeof mount>, title: string) {
  return wrapper.findAll('button').find((b) => b.attributes('title') === title)
}

describe('AiChatPanel · 工作账本', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('未设 title → 用首条 user 消息做名字（不是会话 id、不是空白）', async () => {
    const wrapper = await mountLedger([conv()])
    const row = wrapper.find('.history-item')
    expect(row.text()).toContain('本月有哪些事件？')
    expect(row.text()).not.toContain('c1')
  })

  it('设了 title → 用 title，且副行只列出实际有值的项（条数 + 模型）', async () => {
    const wrapper = await mountLedger([conv({ title: 'Q3 客户风险盘点', model: undefined, messageCount: undefined })])
    const row = wrapper.find('.history-item')
    expect(row.text()).toContain('Q3 客户风险盘点')
    // 缺 messageCount / model 时不留「· ·」这类空占位
    expect(row.text()).not.toContain('undefined')
    expect(row.text()).not.toContain('· ·')
  })

  it('副行带条数与模型', async () => {
    const wrapper = await mountLedger([conv()])
    const row = wrapper.find('.history-item')
    expect(row.text()).toContain('6 条消息')
    expect(row.text()).toContain('deepseek-v4-flash')
  })

  it('重命名 → 调 renameApi 并就地更新行上的名字', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '  新名字  ', action: 'confirm' } as never)
    mocks.rename.mockResolvedValue(conv({ title: '新名字' }))
    const wrapper = await mountLedger([conv()])

    await rowButton(wrapper, '重命名')!.trigger('click')
    await flushPromises()

    // 两端空白被裁掉后才发给服务端
    expect(mocks.rename).toHaveBeenCalledWith('c1', '新名字')
    expect(wrapper.find('.history-item').text()).toContain('新名字')
  })

  it('重命名取消 → 不发请求（取消不是错误）', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue('cancel')
    const wrapper = await mountLedger([conv()])

    await rowButton(wrapper, '重命名')!.trigger('click')
    await flushPromises()

    expect(mocks.rename).not.toHaveBeenCalled()
  })

  it('执行轨迹入口 → 跳轨迹页并带上既有查询参数名 conv', async () => {
    const wrapper = await mountLedger([conv()])

    await rowButton(wrapper, '执行轨迹')!.trigger('click')
    await flushPromises()

    expect(mocks.push).toHaveBeenCalledWith({ name: 'workbench-ai-trace', query: { conv: 'c1' } })
  })

  it('普通用户看到的是用户口径的欢迎词 —— 不是系统助手那句', async () => {
    const wrapper = await mountPanel([])

    expect(wrapper.text()).toContain('你自己的数据')
    // `assWelcome` 是系统助手的话术（问模块 / 配权限 / 去管理台），普通用户不该看到它
    expect(wrapper.text()).not.toContain('系统有哪些模块')
  })
})

/** 一段「门控段拒绝」：没有 tool_start，只有带 explanation 的 tool_end（R5 演示工具） */
const r5End = {
  name: 'delete_customer',
  success: false,
  error: 'Blocked by policy',
  explanation: {
    deniedBy: 'risk_policy',
    reasonKey: 'ai.deny.risk_r5.reason',
    nextStepKey: 'ai.deny.risk_r5.nextStep',
    reason: 'server reason',
    nextStep: 'server next step',
    params: { tool: 'delete_customer' },
  },
}

/** 发一条消息并抓住这次流式调用的 onEvent（组件不暴露内部状态，只能从事件入口驱动） */
async function sendAndCapture(wrapper: ReturnType<typeof mount>, text = '删除客户', label = '发送') {
  const captured: { current: { onEvent: (ev: unknown) => void } | null } = { current: null }
  mocks.streamChat.mockImplementation((opts: { onEvent: (ev: unknown) => void }) => {
    captured.current = opts
    return Promise.resolve()
  })
  await wrapper.find('textarea').setValue(text)
  const sendBtn = wrapper.findAll('button').find((b) => b.text().includes(label))
  await sendBtn!.trigger('click')
  await flushPromises()
  return captured.current!
}

describe('AiChatPanel · 拒绝指引渲染', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('无 tool_start 的 tool_end（门控段拒绝）→ 建一个拒绝步骤并渲染为什么 + 怎么解决', async () => {
    const wrapper = await mountPanel([])
    const stream = await sendAndCapture(wrapper)

    stream.onEvent({ type: 'tool_end', toolEnd: r5End })
    await flushPromises()

    const cards = wrapper.findAll('.ai-denial-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('风险策略（R5）')
    expect(cards[0].text()).toContain('工具「delete_customer」的风险级为 R5')
    expect(cards[0].text()).toContain('请改用可逆的低风险工具')
    expect(cards[0].text()).not.toContain('server reason')
  })

  it('已有 tool_start 时不重复建步骤：拒绝指引挂在原工具卡上', async () => {
    const wrapper = await mountPanel([])
    const stream = await sendAndCapture(wrapper)

    stream.onEvent({
      type: 'tool_start',
      toolStart: { name: 'delete_customer', arguments: {}, isWrite: false },
    })
    stream.onEvent({ type: 'tool_end', toolEnd: r5End })
    await flushPromises()

    // Still exactly one tool step and one denial card: if the refusal had opened its own step,
    // the card count and the human label would both double.
    // 仍然只有一张工具卡与一张拒绝卡：若拒绝另起一步，卡片数与人类标签都会翻倍。
    expect(wrapper.findAll('.ai-denial-card')).toHaveLength(1)
    expect(wrapper.findAll('.tool-card')).toHaveLength(1)
    // The tool card shows the human label; the raw registry name stays in the denial card.
    // 工具卡显示人类标签；原始注册名只留在拒绝卡。
    expect(wrapper.text()).toContain('删除客户')
    expect((wrapper.text().match(/delete_customer/g) ?? []).length).toBe(2)
  })

  it('成功路径（无 explanation）不渲染拒绝卡 —— 前端不凭空造', async () => {
    const wrapper = await mountPanel([])
    const stream = await sendAndCapture(wrapper)

    stream.onEvent({
      type: 'tool_start',
      toolStart: { name: 'query_events', arguments: {}, isWrite: false },
    })
    stream.onEvent({
      type: 'tool_end',
      toolEnd: { name: 'query_events', success: true },
    })
    await flushPromises()

    expect(wrapper.findAll('.ai-denial-card')).toHaveLength(0)
  })

  it('无 tool_start 且无 explanation 的孤立 tool_end 不建步骤', async () => {
    const wrapper = await mountPanel([])
    const stream = await sendAndCapture(wrapper)

    stream.onEvent({ type: 'tool_end', toolEnd: { name: 'query_events', success: false } })
    await flushPromises()

    expect(wrapper.findAll('.ai-denial-card')).toHaveLength(0)
  })

  it('英文界面用英文渲染同一 reasonKey/nextStepKey', async () => {
    const wrapper = await mountPanel([], 'en')
    const stream = await sendAndCapture(wrapper, 'delete', 'Send')

    stream.onEvent({ type: 'tool_end', toolEnd: r5End })
    await flushPromises()

    const card = wrapper.find('.ai-denial-card')
    expect(card.text()).toContain('Risk policy (R5)')
    expect(card.text()).toContain('Tool "delete_customer" is risk level R5')
    expect(card.text()).toContain('Use a reversible lower-risk tool')
  })
})

const page = (items: unknown[]) => ({ items, total: items.length, page: 1, limit: 100, totalPages: 1 })

describe('AiChatPanel · guided Copilot quick start', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('普通用户看到引导式入口；管理员看到系统助手欢迎语而不是引导', async () => {
    mocks.crmCustomers.mockResolvedValue(page([{ id: 5, name: '辰光建材' }]))

    const userWrapper = await mountPanel([])
    expect(userWrapper.find('[data-testid="copilot-quick-start"]').exists()).toBe(true)

    useAuthStore().user = { id: 1, username: 'admin', role: 'admin' } as never
    const adminWrapper = await mountPanel([])
    expect(adminWrapper.find('[data-testid="copilot-quick-start"]').exists()).toBe(false)
    expect(adminWrapper.text()).toContain('系统有哪些模块')
  })

  it('选客户 → 一键查风险 → 展示服务端等级、评分与依据（人类工具标签）', async () => {
    mocks.crmCustomers.mockResolvedValue(page([{ id: 5, name: '辰光建材' }]))
    mocks.crmAnalyze.mockResolvedValue({ level: 'high', score: 87, reasons: ['2 笔订单逾期'] })

    const wrapper = await mountPanel([])
    await wrapper.find('[data-testid="quick-action-risk"]').trigger('click')
    await flushPromises()

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 5)
    await nextTick()
    await wrapper.find('[data-testid="quick-risk-run"]').trigger('click')
    await flushPromises()

    expect(mocks.crmAnalyze).toHaveBeenCalledWith(5)
    const card = wrapper.find('[data-testid="risk-analysis-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('高')
    expect(card.text()).toContain('87')
    expect(card.text()).toContain('2 笔订单逾期')
    // Human-readable tool label, never the raw registry name.
    // 显示人类可读的工具标签，不暴露原始注册名。
    expect(card.text()).toContain('客户风险分析')
    expect(card.text()).not.toContain('analyze_customer_risk')
  })

  it('选客户 + 标题 → 复核 → 真实写入；结果卡显示服务端任务号', async () => {
    mocks.crmCustomers.mockResolvedValue(page([{ id: 5, name: '辰光建材' }]))
    mocks.crmCreateTask.mockResolvedValue({ id: 42, customerId: 5, title: '回访逾期客户', status: 'pending' })

    const wrapper = await mountPanel([])
    await wrapper.find('[data-testid="quick-action-task"]').trigger('click')
    await flushPromises()

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 5)
    await nextTick()
    await wrapper.findComponent({ name: 'ElInput' }).find('input').setValue('回访逾期客户')
    await wrapper.find('[data-testid="quick-task-create"]').trigger('click')
    await flushPromises()

    // Review first; no request yet.
    // 先复核，此时不发请求。
    expect(wrapper.find('[data-testid="quick-task-review"]').exists()).toBe(true)
    expect(mocks.crmCreateTask).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="quick-task-confirm"]').trigger('click')
    await flushPromises()

    expect(mocks.crmCreateTask).toHaveBeenCalledWith({ customerId: 5, title: '回访逾期客户' })
    const card = wrapper.find('[data-testid="task-action-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('创建跟进任务')
    expect(card.text()).toContain('回访逾期客户')
    expect(card.text()).toContain('#42')
  })

  it('写入失败时如实显示错误，不假装成功', async () => {
    mocks.crmCustomers.mockResolvedValue(page([{ id: 5, name: '辰光建材' }]))
    mocks.crmCreateTask.mockRejectedValue(new Error('403'))

    const wrapper = await mountPanel([])
    await wrapper.find('[data-testid="quick-action-task"]').trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 5)
    await nextTick()
    await wrapper.findComponent({ name: 'ElInput' }).find('input').setValue('回访逾期客户')
    await wrapper.find('[data-testid="quick-task-create"]').trigger('click')
    await wrapper.find('[data-testid="quick-task-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="task-action-card"]').text()).toContain('403')
    expect(wrapper.find('[data-testid="task-action-card"]').text()).not.toContain('已创建')
  })

  it('列表为空时引导仍在，但不发起任何调用', async () => {
    mocks.crmCustomers.mockResolvedValue(page([]))

    const wrapper = await mountPanel([])
    await wrapper.find('[data-testid="quick-action-risk"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="copilot-quick-start"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quick-empty"]').text()).toContain('暂无客户可分析')
    await wrapper.find('[data-testid="quick-risk-run"]').trigger('click')
    await flushPromises()
    expect(mocks.crmAnalyze).not.toHaveBeenCalled()
  })
})

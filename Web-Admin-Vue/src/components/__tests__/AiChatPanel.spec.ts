// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

// vi.mock 会被提升到 import 之前，故桩必须走 vi.hoisted
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  list: vi.fn(),
  rename: vi.fn(),
  streamChat: vi.fn(),
  confirmTool: vi.fn(),
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

    expect(wrapper.findAll('.ai-denial-card')).toHaveLength(1)
    // 仍然只有一张工具卡：工具名出现在工具卡标题、拒绝卡标题与原因文案三处；
    // 若另起了一条拒绝步骤，它会再出现三次。
    expect((wrapper.text().match(/delete_customer/g) ?? []).length).toBe(3)
    expect(wrapper.text()).toContain('删除客户')
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

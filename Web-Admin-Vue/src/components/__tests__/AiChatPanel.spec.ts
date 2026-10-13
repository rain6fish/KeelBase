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
vi.mock('@/utils/streamChat', () => ({ streamChat: vi.fn(), confirmTool: vi.fn() }))

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

async function mountLedger(rows: unknown[]) {
  mocks.list.mockResolvedValue(rows)
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  const wrapper = mount(AiChatPanel, { global: { plugins: [ElementPlus, i18n] } })
  await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh()
  await flushPromises()
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
})

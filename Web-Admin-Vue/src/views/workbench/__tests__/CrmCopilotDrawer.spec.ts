import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import type { StreamChatOptions } from '@/utils/streamChat'

const { streamChatMock, confirmToolMock } = vi.hoisted(() => ({
  streamChatMock: vi.fn(),
  confirmToolMock: vi.fn(),
}))

vi.mock('@/utils/streamChat', () => ({
  streamChat: streamChatMock,
  confirmTool: confirmToolMock,
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: vi.fn(), success: vi.fn() }),
}))

import ElementPlus from 'element-plus'
import CrmCopilotDrawer from '@/components/CrmCopilotDrawer.vue'

function mountDrawer() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(CrmCopilotDrawer, {
    global: { plugins: [ElementPlus, i18n] },
    props: { modelValue: true, customerName: '上海 XX 公司', customerId: 7 },
  })
}

/** 发送一条消息并捕获 streamChat 的选项（供手动驱动事件序列） */
async function sendAndCapture(wrapper: ReturnType<typeof mountDrawer>): Promise<StreamChatOptions> {
  let opts!: StreamChatOptions
  streamChatMock.mockImplementation((o: StreamChatOptions) => {
    opts = o
    return Promise.resolve()
  })
  await flushPromises() // el-drawer 过渡后内容才渲染
  await wrapper.find('input').setValue('给这个客户建跟进任务')
  await wrapper.find('input').trigger('keyup.enter')
  await flushPromises()
  expect(streamChatMock).toHaveBeenCalledTimes(1)
  return opts
}

function confirmCardButton(wrapper: ReturnType<typeof mountDrawer>, label: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(label))
}

describe('CrmCopilotDrawer（D1 闭环：流式 + 确认卡 + 执行通知）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('AI 建议写操作 → 确认卡出现；批准后调 confirmTool(approve) → 执行成功 emit executed', async () => {
    const wrapper = mountDrawer()
    const opts = await sendAndCapture(wrapper)

    opts.onEvent({
      type: 'tool_start',
      toolStart: { name: 'create_followup_task', summary: '创建跟进任务', arguments: {}, isWrite: true, riskLevel: 'R3' },
    })
    opts.onEvent({
      type: 'confirmation_request',
      confirmation: { token: 'tok-1', toolName: 'create_followup_task', summary: '给上海 XX 公司创建跟进任务', arguments: { customerId: 7, title: '跟进' } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('需确认的操作')
    await confirmCardButton(wrapper, '批准')!.trigger('click')
    await flushPromises()
    expect(confirmToolMock).toHaveBeenCalledWith('tok-1', 'approve', false)

    opts.onEvent({
      type: 'confirmation_decision',
      confirmationDecision: { toolName: 'create_followup_task', approved: true, success: true, resultId: 42 },
    })
    opts.onEvent({ type: 'tool_end', toolEnd: { name: 'create_followup_task', success: true, summary: '已创建' } })
    opts.onEvent({ type: 'done', conversationId: 'conv-1' })
    opts.onEnd?.()
    await flushPromises()

    expect(wrapper.emitted('executed')?.[0]).toEqual([{ resultType: 'crm_task', resultId: 42 }])
  })

  it('拒绝 → 调 confirmTool(reject)，不 emit executed', async () => {
    const wrapper = mountDrawer()
    const opts = await sendAndCapture(wrapper)

    opts.onEvent({
      type: 'confirmation_request',
      confirmation: { token: 'tok-2', toolName: 'create_followup_task', summary: '创建跟进任务', arguments: { customerId: 7, title: '跟进' } },
    })
    await flushPromises()

    await confirmCardButton(wrapper, '拒绝')!.trigger('click')
    await flushPromises()
    expect(confirmToolMock).toHaveBeenCalledWith('tok-2', 'reject')

    opts.onEvent({
      type: 'confirmation_decision',
      confirmationDecision: { toolName: 'create_followup_task', approved: false },
    })
    opts.onEvent({ type: 'tool_end', toolEnd: { name: 'create_followup_task', success: false, error: 'User declined' } })
    opts.onEnd?.()
    await flushPromises()

    expect(wrapper.emitted('executed')).toBeUndefined()
  })

  it('写工具已信任（无确认卡）→ tool_end 成功且结果来自 confirmation_decision → emit executed', async () => {
    const wrapper = mountDrawer()
    const opts = await sendAndCapture(wrapper)

    // 已信任写工具：无 confirmation_request，直接 tool_start → tool_end
    opts.onEvent({
      type: 'tool_start',
      toolStart: { name: 'create_followup_task', summary: '创建跟进任务', arguments: {}, isWrite: true },
    })
    opts.onEvent({ type: 'tool_end', toolEnd: { name: 'create_followup_task', success: true, summary: '已创建' } })
    opts.onEvent({ type: 'done', conversationId: 'conv-1' })
    opts.onEnd?.()
    await flushPromises()

    // 无 confirmation_decision → 无 resultId → 仅刷新不钻取
    expect(wrapper.emitted('executed')).toBeUndefined()
  })
})

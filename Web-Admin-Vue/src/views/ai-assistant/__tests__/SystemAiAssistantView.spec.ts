// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { streamChatMock, confirmToolMock, errorMock } = vi.hoisted(() => ({
  streamChatMock: vi.fn(),
  confirmToolMock: vi.fn(),
  errorMock: vi.fn(),
}))

vi.mock('@/utils/streamChat', () => ({
  streamChat: streamChatMock,
  confirmTool: confirmToolMock,
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import ElementPlus from 'element-plus'
import SystemAiAssistantView from '../SystemAiAssistantView.vue'

/** 捕获 streamChat options，测试内手动驱动事件 */
function captureStream() {
  let opts: { onEvent: (e: unknown) => void; onEnd?: () => void } | null = null
  streamChatMock.mockImplementation((o: never) => {
    opts = o as never
    return Promise.resolve()
  })
  return () => opts!
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(SystemAiAssistantView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true },
    },
  })
}

async function sendText(wrapper: ReturnType<typeof mountView>, text: string) {
  await wrapper.find('textarea').setValue(text)
  await wrapper.find('.el-button--primary').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SystemAiAssistantView', () => {
  it('挂载 → 渲染欢迎语（空对话状态），不发起对话', () => {
    const wrapper = mountView()

    expect(wrapper.text()).toContain('系统 AI 助手')
    expect(streamChatMock).not.toHaveBeenCalled()
  })

  it('发送 → 走管理端流式端点，text/navigate 事件渲染回复与跳转', async () => {
    const opts = captureStream()
    const wrapper = mountView()
    await sendText(wrapper, '系统有哪些模块？')

    expect(streamChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/admin/ai/chat/stream', message: '系统有哪些模块？', conversationId: undefined }),
    )
    opts().onEvent({ type: 'text', content: '平台共 31 个模块' })
    opts().onEvent({ type: 'navigate', route: '/system' })
    await flushPromises()

    expect(wrapper.text()).toContain('平台共 31 个模块')
    expect(wrapper.text()).toContain('/system')
  })

  it('confirmation_request → 渲染确认卡；批准 → confirmTool(approve)', async () => {
    const opts = captureStream()
    confirmToolMock.mockResolvedValue(undefined)
    const wrapper = mountView()
    await sendText(wrapper, '建个事件')

    opts().onEvent({
      type: 'confirmation_request',
      confirmation: { token: 't1', toolName: 'create_event', summary: '创建事件', mode: 'confirmation' },
    })
    await flushPromises()

    const approve = wrapper.findAll('button').find((b) => b.text().includes('批准'))
    expect(approve).toBeTruthy()
    await approve!.trigger('click')
    await flushPromises()
    expect(confirmToolMock).toHaveBeenCalledWith('t1', 'approve', false)
  })

  it('error 事件 → 渲染错误提示，不抛错', async () => {
    const opts = captureStream()
    const wrapper = mountView()
    await sendText(wrapper, 'hello')

    opts().onEvent({ type: 'error', error: 'AI 服务不可用' })
    await flushPromises()

    expect(wrapper.text()).toContain('AI 服务不可用')
  })

  it('新对话 → 清空消息区', async () => {
    const opts = captureStream()
    const wrapper = mountView()
    await sendText(wrapper, '问题')
    opts().onEvent({ type: 'text', content: '回答' })
    await flushPromises()
    expect(wrapper.text()).toContain('回答')

    await wrapper.find('.el-button.is-text').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('回答')
    expect(wrapper.text()).toContain('系统 AI 助手')
  })
})

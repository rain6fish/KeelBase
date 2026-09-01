// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { adminAiChatMock, errorMock } = vi.hoisted(() => ({
  adminAiChatMock: vi.fn(),
  errorMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: { adminAiChat: adminAiChatMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import ElementPlus from 'element-plus'
import SystemAiAssistantView from '../SystemAiAssistantView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(SystemAiAssistantView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SystemAiAssistantView', () => {
  it('挂载 → 渲染欢迎语（空对话状态）', () => {
    const wrapper = mountView()

    expect(wrapper.text()).toContain('系统 AI 助手')
    expect(adminAiChatMock).not.toHaveBeenCalled()
  })

  it('发送消息 → 调用 adminAiChat({message, conversationId: undefined}) 并追加回复', async () => {
    adminAiChatMock.mockResolvedValue({
      reply: '平台共 31 个模块',
      conversationId: 'c-1',
      navigateTo: '/system',
      toolCalls: ['navigate_admin_page'],
    })

    const wrapper = mountView()
    await wrapper.find('textarea').setValue('系统有哪些模块？')
    await wrapper.find('.el-button--primary').trigger('click')
    await flushPromises()

    expect(adminAiChatMock).toHaveBeenCalledWith({ message: '系统有哪些模块？', conversationId: undefined })
    expect(wrapper.text()).toContain('平台共 31 个模块')
    expect(wrapper.text()).toContain('/system')
  })

  it('对话失败 → snackbar.error 提示', async () => {
    adminAiChatMock.mockRejectedValue(new Error('AI 服务不可用'))

    const wrapper = mountView()
    await wrapper.find('textarea').setValue('hello')
    await wrapper.find('.el-button--primary').trigger('click')
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('AI 服务不可用')
  })

  it('新对话 → 清空消息区', async () => {
    adminAiChatMock.mockResolvedValue({ reply: '回答', conversationId: 'c-1' })

    const wrapper = mountView()
    await wrapper.find('textarea').setValue('问题')
    await wrapper.find('.el-button--primary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('回答')

    await wrapper.find('.el-button.is-text').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('回答')
    expect(wrapper.text()).toContain('系统 AI 助手')
  })
})

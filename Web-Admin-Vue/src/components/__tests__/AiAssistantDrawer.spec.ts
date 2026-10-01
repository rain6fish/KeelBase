// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { streamChatMock, confirmToolMock, adminAiChatMock, userChatMock, authStub } = vi.hoisted(
  () => ({
    streamChatMock: vi.fn(),
    confirmToolMock: vi.fn(),
    adminAiChatMock: vi.fn(),
    userChatMock: vi.fn(),
    authStub: { isAdmin: false },
  }),
)

vi.mock('@/utils/streamChat', () => ({
  streamChat: streamChatMock,
  confirmTool: confirmToolMock,
}))
vi.mock('@/api/ai', () => ({ aiApi: { chat: userChatMock } }))
vi.mock('@/api/admin', () => ({
  adminApi: {
    adminAiChat: adminAiChatMock,
    aiConversations: vi.fn().mockResolvedValue([]),
    aiConversation: vi.fn(),
    deleteAiConversation: vi.fn(),
  },
}))
vi.mock('@/api/capabilities', () => ({
  capabilitiesApi: { get: vi.fn().mockResolvedValue({ businessModules: [] }) },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: vi.fn(), success: vi.fn() }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authStub }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import ElementPlus from 'element-plus'
import AiAssistantDrawer from '../AiAssistantDrawer.vue'

function mountDrawer() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiAssistantDrawer, {
    props: { modelValue: true },
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        // el-drawer 把内容 teleport 到 body，wrapper.find 找不到；本用例只验发送分支，
        // 故把抽屉壳换成直渲 slot 的桩，让输入区留在组件树里。
        ElDrawer: { template: '<div class="drawer-stub"><slot /></div>' },
        ConfirmDialog: true,
        AiConfirmationCard: true,
      },
    },
  })
}

async function sendText(wrapper: ReturnType<typeof mountDrawer>, text: string) {
  await wrapper.find('textarea').setValue(text)
  await wrapper.find('.el-button--primary').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  authStub.isAdmin = false
})

describe('AiAssistantDrawer 委托绕行', () => {
  it('委托类消息（普通用户）→ 走非流式 /ai/chat，不走 SSE', async () => {
    userChatMock.mockResolvedValue({ reply: '已为你安排本周', conversationId: 'c-1' })
    const wrapper = mountDrawer()
    await sendText(wrapper, '周计划')

    expect(userChatMock).toHaveBeenCalledWith({ message: '周计划', conversationId: undefined })
    expect(streamChatMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('已为你安排本周')
  })

  it('委托类消息（管理员）→ 走非流式 /admin/ai/chat（同一入参，端点按角色选）', async () => {
    authStub.isAdmin = true
    adminAiChatMock.mockResolvedValue({ reply: '系统助手：已安排', conversationId: 'c-2' })
    const wrapper = mountDrawer()
    await sendText(wrapper, '盘点一下本周')

    expect(adminAiChatMock).toHaveBeenCalledWith({ message: '盘点一下本周', conversationId: undefined })
    expect(userChatMock).not.toHaveBeenCalled()
    expect(streamChatMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('系统助手：已安排')
  })

  it('非委托消息仍走 SSE（绕行不得吞掉普通对话）', async () => {
    streamChatMock.mockResolvedValue(undefined)
    const wrapper = mountDrawer()
    await sendText(wrapper, '你好')

    expect(streamChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: '你好', endpoint: undefined }),
    )
    expect(userChatMock).not.toHaveBeenCalled()
  })
})

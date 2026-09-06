// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { listMock, unreadMock, readAllMock, snackMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  unreadMock: vi.fn(),
  readAllMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api/workbench', () => ({
  workbenchApi: {
    notifications: listMock,
    unreadCount: unreadMock,
    readNotification: vi.fn(),
    readAllNotifications: readAllMock,
    removeNotification: vi.fn(),
  },
}))
vi.mock('@/api/client', () => ({ isEmailNotVerified: vi.fn(() => false) }))
// 真实 connectRealtime 会 new WebSocket（jsdom 无 WebSocket 实现会抛错）→ 整体 mock
vi.mock('@/api/ws', () => ({
  connectRealtime: vi.fn(() => undefined),
  onRealtimeMessage: vi.fn(() => () => undefined),
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))

import ElementPlus from 'element-plus'
import MyNotificationsView from '../MyNotificationsView.vue'

const notification = {
  id: 1,
  title: '张三批准了你的报销申请',
  body: '金额 ¥1,200 已通过审批',
  type: 'approval',
  isRead: false,
  createdAt: '2026-09-01T08:00:00Z',
}

// PageHeader 渲染标题槽：stub 透传默认槽，让「全部已读」按钮暴露可驱动
const PageHeaderStub = defineComponent({ template: '<div><slot /></div>' })

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(MyNotificationsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        teleport: true,
        AppIcon: true,
        PageHeader: PageHeaderStub,
        ConfirmDialog: true,
        StatusChip: true,
        AppPagination: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listMock.mockResolvedValue({ items: [], total: 0 })
  unreadMock.mockResolvedValue({ count: 0 })
})

describe('MyNotificationsView（工作台·我的通知）', () => {
  it('挂载 → 拉通知列表 + 未读数并渲染行文本', async () => {
    listMock.mockResolvedValue({ items: [notification], total: 1 })
    unreadMock.mockResolvedValue({ count: 2 })

    const wrapper = mountView()
    await flushPromises()

    expect(listMock).toHaveBeenCalledWith(1, 20)
    expect(unreadMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('张三批准了你的报销申请')
    expect(wrapper.text()).toContain('金额 ¥1,200 已通过审批')
  })

  it('空列表 → 页面不抛错正常渲染', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(listMock).toHaveBeenCalledTimes(1)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('张三批准了你的报销申请')
  })

  it('加载失败 → snackbar.error(err.message)，不抛错', async () => {
    listMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('网络错误')
    expect(wrapper.exists()).toBe(true)
  })

  it('点击「全部已读」→ readAllNotifications + success + 重拉', async () => {
    const wrapper = mountView()
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('全部已读'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(readAllMock).toHaveBeenCalledTimes(1)
    expect(snackMock.success).toHaveBeenCalled()
    // 初始 load 1 次 + 全部已读后 refresh 重拉
    expect(listMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

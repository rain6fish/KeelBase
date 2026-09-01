// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { usersListMock, broadcastMock, errorMock, successMock } = vi.hoisted(() => ({
  usersListMock: vi.fn(),
  broadcastMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/users', () => ({
  usersApi: { list: usersListMock },
}))
vi.mock('@/api/admin', () => ({
  adminApi: { broadcast: broadcastMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import NotificationsView from '../NotificationsView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(NotificationsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotificationsView', () => {
  it('挂载 → 调用 usersApi.list(1, 100) 加载可选用户', async () => {
    usersListMock.mockResolvedValue({ items: [{ id: 1, username: 'alex', nickname: 'Alex' }], total: 1 })

    mountView()
    await flushPromises()

    expect(usersListMock).toHaveBeenCalledWith(1, 100)
  })

  it('发送给全体 → 调用 adminApi.broadcast（不含 userIds）', async () => {
    usersListMock.mockResolvedValue({ items: [], total: 0 })
    broadcastMock.mockResolvedValue({ sent: 3, mode: 'all' })

    const wrapper = mountView()
    await flushPromises()

    // 标题（第一个 input），body/type 留空 → undefined；sendToAll 默认 true
    await wrapper.findAll('input')[0].setValue('系统维护通知')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(broadcastMock).toHaveBeenCalledWith({ title: '系统维护通知', body: undefined, type: undefined })
    expect(successMock).toHaveBeenCalledWith('已发送给 3 个用户')
  })

  it('标题为空 → snackbar.error 且不调用 broadcast', async () => {
    usersListMock.mockResolvedValue({ items: [], total: 0 })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('请输入标题')
    expect(broadcastMock).not.toHaveBeenCalled()
  })

  it('广播失败 → snackbar.error 提示', async () => {
    usersListMock.mockResolvedValue({ items: [], total: 0 })
    broadcastMock.mockRejectedValue(new Error('服务异常'))

    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('input')[0].setValue('通知')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('服务异常')
  })
})

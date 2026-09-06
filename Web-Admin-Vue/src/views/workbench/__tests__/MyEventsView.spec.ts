// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { eventsMock, removeMock, snackMock } = vi.hoisted(() => ({
  eventsMock: vi.fn(),
  removeMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api/workbench', () => ({
  workbenchApi: { events: eventsMock, removeEvent: removeMock },
}))
vi.mock('@/api/client', () => ({ isEmailNotVerified: vi.fn(() => false) }))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))

import ElementPlus from 'element-plus'
import MyEventsView from '../MyEventsView.vue'

const event = {
  id: 1,
  title: '产品评审会',
  startTime: '2026-09-01T09:00:00Z',
  endTime: '2026-09-01T10:00:00Z',
  location: '会议室 A',
  isCancelled: false,
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(MyEventsView, {
    global: {
      plugins: [i18n, ElementPlus],
      // el-dialog teleport 到 body → stub 内联；AppIcon 为 main.ts 全局注册；辅助组件仅占位，行文本断言来自真实 AppTable
      stubs: {
        teleport: true,
        AppIcon: true,
        PageHeader: true,
        DebouncedSearch: true,
        RangeFilter: true,
        ConfirmDialog: true,
        StatusChip: true,
        AppPagination: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  eventsMock.mockResolvedValue({ items: [], total: 0 })
})

describe('MyEventsView（工作台·我的事件）', () => {
  it('挂载 → 调用 workbenchApi.events() 并渲染返回的事件行', async () => {
    eventsMock.mockResolvedValue({ items: [event], total: 1 })

    const wrapper = mountView()
    await flushPromises()

    expect(eventsMock).toHaveBeenCalledTimes(1)
    expect(eventsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    )
    expect(wrapper.text()).toContain('产品评审会')
    expect(wrapper.text()).toContain('会议室 A')
  })

  it('空列表 → 页面不抛错正常渲染（无行数据）', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(eventsMock).toHaveBeenCalledTimes(1)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('产品评审会')
  })

  it('加载失败 → snackbar.error(err.message)，不抛错', async () => {
    eventsMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('网络错误')
    expect(wrapper.exists()).toBe(true)
  })
})

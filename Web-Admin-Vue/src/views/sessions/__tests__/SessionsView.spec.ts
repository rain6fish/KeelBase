// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { sessionsMock, revokeMock, errorMock, successMock } = vi.hoisted(() => ({
  sessionsMock: vi.fn(),
  revokeMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: {
    sessions: sessionsMock,
    revokeSession: revokeMock,
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import SessionsView from '../SessionsView.vue'

const AppTableStub = defineComponent({
  name: 'AppTable',
  props: ['headers', 'items', 'loading', 'total', 'itemsPerPage'],
  template:
    '<div class="app-table-stub"><template v-for="item in items" :key="item.id"><slot name="item.actions" :item="item" /></template></div>',
})
const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialog',
  props: ['modelValue', 'title', 'content'],
  emits: ['confirm', 'update:modelValue'],
  template:
    '<div class="confirm-stub" v-if="modelValue"><button class="confirm-btn" @click="$emit(\'confirm\')">confirm</button></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(SessionsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: AppTableStub,
        ConfirmDialog: ConfirmDialogStub,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SessionsView', () => {
  it('挂载 → 调用 adminApi.sessions() 加载会话列表', async () => {
    sessionsMock.mockResolvedValue([{ id: 1, userId: 1, username: 'alex', deviceName: 'Chrome', ip: '127.0.0.1', createdAt: '2026-08-20', lastActiveAt: '2026-08-21' }])

    const wrapper = mountView()
    await flushPromises()

    expect(sessionsMock).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'AppTable' }).exists()).toBe(true)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    sessionsMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('远程登出确认 → 调用 adminApi.revokeSession(id) + success + 刷新', async () => {
    sessionsMock.mockResolvedValue([{ id: 5, userId: 2, username: 'bob', deviceName: null, ip: null, createdAt: null, lastActiveAt: '2026-08-21' }])
    revokeMock.mockResolvedValue(null)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--danger').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(revokeMock).toHaveBeenCalledWith(5)
    expect(successMock).toHaveBeenCalledWith('已下线')
    expect(sessionsMock).toHaveBeenCalledTimes(2)
  })
})

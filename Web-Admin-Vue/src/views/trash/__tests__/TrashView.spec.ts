import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { trashMock, restoreMock, errorMock, successMock } = vi.hoisted(() => ({
  trashMock: vi.fn(),
  restoreMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  adminApi: {
    trash: trashMock,
    restoreTrash: restoreMock,
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import TrashView from '../TrashView.vue'

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
  return mount(TrashView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: AppTableStub,
        AppPagination: true,
        StatusChip: true,
        ConfirmDialog: ConfirmDialogStub,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TrashView', () => {
  it('挂载 → 调用 adminApi.trash(1, 20) 加载第一页', async () => {
    trashMock.mockResolvedValue({ items: [{ type: 'event', id: 1, title: '周会', userId: 1, username: 'alex', deletedAt: '2026-08-21' }], total: 1, page: 1, limit: 20, totalPages: 1 })

    const wrapper = mountView()
    await flushPromises()

    expect(trashMock).toHaveBeenCalledWith(1, 20)
    expect(wrapper.findComponent({ name: 'AppTable' }).exists()).toBe(true)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    trashMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('恢复确认 → 调用 adminApi.restoreTrash(type, id) + success + 刷新', async () => {
    trashMock.mockResolvedValue({ items: [{ type: 'todo', id: 7, title: '写报告', userId: 2, username: 'bob', deletedAt: null }], total: 1, page: 1, limit: 20, totalPages: 1 })
    restoreMock.mockResolvedValue({ restored: true, type: 'todo', id: 7 })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(restoreMock).toHaveBeenCalledWith('todo', 7)
    expect(successMock).toHaveBeenCalledWith('已恢复')
    expect(trashMock).toHaveBeenCalledTimes(2)
  })
})

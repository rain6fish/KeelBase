import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { listMock, removeMock, errorMock, successMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  removeMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/notes', () => ({
  notesApi: { list: listMock, remove: removeMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import NotesView from '../NotesView.vue'

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
  return mount(NotesView, {
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

describe('NotesView', () => {
  it('挂载 → 调用 notesApi.list() 加载笔记列表', async () => {
    listMock.mockResolvedValue([
      { id: 1, userId: null, title: '周会记录', content: '内容', category: 'work', createdAt: '2026-08-20' },
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(listMock).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'AppTable' }).exists()).toBe(true)
  })

  it('列表加载失败 → snackbar.error 提示', async () => {
    listMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('删除确认 → 调用 notesApi.remove(id) + success + 重新加载', async () => {
    listMock.mockResolvedValue([{ id: 3, userId: null, title: 'x', content: 'c', category: null, createdAt: '' }])
    removeMock.mockResolvedValue(undefined)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(removeMock).toHaveBeenCalledWith(3)
    expect(successMock).toHaveBeenCalledWith('已删除')
    expect(listMock).toHaveBeenCalledTimes(2)
  })
})

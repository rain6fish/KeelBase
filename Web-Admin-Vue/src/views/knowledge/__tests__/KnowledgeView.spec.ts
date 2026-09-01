// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { listMock, uploadMock, removeMock, errorMock, successMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/knowledge', () => ({
  knowledgeApi: {
    list: listMock,
    upload: uploadMock,
    remove: removeMock,
    create: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import KnowledgeView from '../KnowledgeView.vue'

// DebouncedSearch stub：可输入关键词并触发 search 事件
const DebouncedSearchStub = defineComponent({
  name: 'DebouncedSearch',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue', 'search'],
  template:
    '<div class="ds-stub"><input class="ds-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><button class="ds-search" @click="$emit(\'search\')">search</button></div>',
})
// PageHeader stub：渲染默认插槽（按钮 + 文件上传 input 在插槽内）
const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="ph-stub"><slot /></div>',
})
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
  return mount(KnowledgeView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: PageHeaderStub,
        AppTable: AppTableStub,
        AppPagination: true,
        DebouncedSearch: DebouncedSearchStub,
        FormDialog: true,
        ConfirmDialog: ConfirmDialogStub,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('KnowledgeView', () => {
  it('挂载 → 调用 knowledgeApi.list(1, 20, undefined) 加载第一页', async () => {
    listMock.mockResolvedValue({ items: [{ id: 1, title: '入职指南', content: 'x', createdAt: '2026-08-20', updatedAt: '' }], total: 1 })

    const wrapper = mountView()
    await flushPromises()

    expect(listMock).toHaveBeenCalledWith(1, 20, undefined)
    expect(wrapper.findComponent({ name: 'AppTable' }).exists()).toBe(true)
  })

  it('列表加载失败 → snackbar.error 提示', async () => {
    listMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('搜索关键词 → 携带 q 参数重新加载', async () => {
    listMock.mockResolvedValue({ items: [], total: 0 })

    const wrapper = mountView()
    await flushPromises()

    // 输入关键词并触发搜索
    await wrapper.find('.ds-input').setValue('周报')
    await wrapper.find('.ds-search').trigger('click')
    await flushPromises()

    expect(listMock).toHaveBeenLastCalledWith(1, 20, '周报')
  })

  it('上传文档 → 调用 knowledgeApi.upload(file) + success + 刷新', async () => {
    listMock.mockResolvedValue({ items: [], total: 0 })
    uploadMock.mockResolvedValue({ id: 9, title: 'doc.pdf', content: '', createdAt: '', updatedAt: '' })

    const wrapper = mountView()
    await flushPromises()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(uploadMock).toHaveBeenCalledWith(file)
    expect(successMock).toHaveBeenCalledWith('文档已上传')
    expect(listMock).toHaveBeenCalledTimes(2)
  })

  it('删除确认 → 调用 knowledgeApi.remove(id) + success + 刷新', async () => {
    listMock.mockResolvedValue({ items: [{ id: 5, title: 'x', content: 'c', createdAt: '', updatedAt: '' }], total: 1 })
    removeMock.mockResolvedValue(null)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--danger').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(removeMock).toHaveBeenCalledWith(5)
    expect(successMock).toHaveBeenCalledWith('已删除')
    expect(listMock).toHaveBeenCalledTimes(2)
  })
})

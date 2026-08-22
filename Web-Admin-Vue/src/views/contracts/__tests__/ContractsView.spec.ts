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

vi.mock('@/api/contracts', () => ({
  contractsApi: { list: listMock, remove: removeMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import ContractsView from '../ContractsView.vue'

// 自定义 stub：AppTable 渲染 #item.actions 具名插槽，让删除按钮可达
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
  return mount(ContractsView, {
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

describe('ContractsView', () => {
  it('挂载 → 调用 contractsApi.list() 加载合同列表', async () => {
    listMock.mockResolvedValue([
      { id: 1, userId: null, name: '采购合同', counterparty: 'A公司', status: 'active', amount: 100, createdAt: '2026-08-20' },
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

  it('删除确认 → 调用 contractsApi.remove(id) + success + 重新加载', async () => {
    listMock.mockResolvedValue([
      { id: 7, userId: null, name: 'x', counterparty: 'A', status: 'active', amount: 1, createdAt: '' },
    ])
    removeMock.mockResolvedValue(undefined)

    const wrapper = mountView()
    await flushPromises()

    // 点击行内删除按钮 → 弹出确认框
    await wrapper.find('.app-table-stub button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    // 确认 → 删除 + 成功提示 + 刷新列表
    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(removeMock).toHaveBeenCalledWith(7)
    expect(successMock).toHaveBeenCalledWith('已删除')
    expect(listMock).toHaveBeenCalledTimes(2)
  })
})

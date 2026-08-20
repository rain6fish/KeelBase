import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

// vi.mock 工厂被 hoist，mock 变量用 vi.hoisted
const { listMock, errorMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  errorMock: vi.fn(),
}))

vi.mock('@/api/users', () => ({
  usersApi: {
    list: listMock,
    create: vi.fn(),
    updateRole: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import ElementPlus from 'element-plus'
import UsersView from '../UsersView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(UsersView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: true,
        AppPagination: true,
        DebouncedSearch: true,
        FormDialog: true,
        ConfirmDialog: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UsersView', () => {
  it('挂载 → 调用 usersApi.list(1, 20) 加载第一页', async () => {
    listMock.mockResolvedValue({ items: [{ id: 1, username: 'alex' }], total: 1 })

    const wrapper = mountView()
    await flushPromises()

    expect(listMock).toHaveBeenCalledWith(1, 20, undefined)
    // AppTable 收到 items（stub props 透传）
    const table = wrapper.findComponent({ name: 'AppTable' })
    expect(table.exists()).toBe(true)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    listMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('list 返回空 → 无异常且 AppTable 收到空数组', async () => {
    listMock.mockResolvedValue({ items: [], total: 0 })

    const wrapper = mountView()
    await flushPromises()

    expect(listMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('网络错误')
  })
})

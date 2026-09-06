// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { customersMock, createMock, snackMock, pushMock } = vi.hoisted(() => ({
  customersMock: vi.fn(),
  createMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  pushMock: vi.fn(),
}))

vi.mock('@/api/crm', () => ({
  crmApi: { customers: customersMock, createCustomer: createMock, deleteCustomer: vi.fn() },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import ElementPlus from 'element-plus'
import CrmCustomersView from '../CrmCustomersView.vue'

const customer = { id: 1, name: '云启科技', company: '云启软件有限公司', status: 'active', riskLevel: 'low' }

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(CrmCustomersView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        teleport: true,
        AppIcon: true,
        PageHeader: true,
        DebouncedSearch: true,
        ConfirmDialog: true,
        StatusChip: true,
        AppPagination: true,
        // 真实 ElSelect/ElOption 在 jsdom 触发 EP「Maximum recursive updates」→ 占位（非断言目标）
        ElSelect: true,
        ElOption: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  customersMock.mockResolvedValue({ items: [], total: 0 })
})

describe('CrmCustomersView（工作台·客户管理）', () => {
  it('挂载 → 调用 crmApi.customers() 并渲染客户行', async () => {
    customersMock.mockResolvedValue({ items: [customer], total: 1 })

    const wrapper = mountView()
    await flushPromises()

    expect(customersMock).toHaveBeenCalledTimes(1)
    expect(customersMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20, keyword: undefined, status: undefined, riskLevel: undefined }),
    )
    expect(wrapper.text()).toContain('云启科技')
    expect(wrapper.text()).toContain('云启软件有限公司')
  })

  it('空列表 → 页面不抛错正常渲染', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(customersMock).toHaveBeenCalledTimes(1)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('云启科技')
  })

  it('加载失败 → snackbar.error(加载失败)，不抛错', async () => {
    customersMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    // 源码 catch 忽略 err，统一提示 loadFailed
    expect(snackMock.error).toHaveBeenCalledWith('加载失败')
    expect(wrapper.exists()).toBe(true)
  })

  it('新建：填客户名称保存 → createCustomer + success + 重拉', async () => {
    const wrapper = mountView()
    await flushPromises()

    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('新增客户'))
    expect(addBtn).toBeTruthy()
    await addBtn!.trigger('click')
    await flushPromises()

    // 弹窗内第一个文本框为客户名称
    const nameInput = wrapper.find('.el-dialog input[type="text"]')
    await nameInput.setValue('华东经销商')
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存'))
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ name: '华东经销商' }))
    expect(snackMock.success).toHaveBeenCalled()
    // 新建成功后重拉列表
    expect(customersMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

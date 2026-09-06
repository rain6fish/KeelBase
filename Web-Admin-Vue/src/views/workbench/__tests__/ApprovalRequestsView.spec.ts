// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { requestsMock, createMock, snackMock, pushMock } = vi.hoisted(() => ({
  requestsMock: vi.fn(),
  createMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  pushMock: vi.fn(),
}))

vi.mock('@/api/approval', () => ({
  approvalApi: { requests: requestsMock, createRequest: createMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import ElementPlus from 'element-plus'
import ApprovalRequestsView from '../ApprovalRequestsView.vue'

const request = {
  id: 1,
  title: '差旅报销',
  type: 'reimbursement',
  amount: 1200,
  reason: '上海出差高铁与住宿',
  status: 'pending',
  riskLevel: 'low',
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(ApprovalRequestsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        teleport: true,
        AppIcon: true,
        PageHeader: true,
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
  requestsMock.mockResolvedValue({ items: [], total: 0 })
})

describe('ApprovalRequestsView（工作台·审批中心）', () => {
  it('挂载 → 调用 approvalApi.requests() 并渲染请求行', async () => {
    requestsMock.mockResolvedValue({ items: [request], total: 1 })

    const wrapper = mountView()
    await flushPromises()

    expect(requestsMock).toHaveBeenCalledTimes(1)
    expect(requestsMock).toHaveBeenCalledWith({ page: 1, limit: 20, status: undefined })
    expect(wrapper.text()).toContain('差旅报销')
  })

  it('空列表 → 页面不抛错正常渲染', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(requestsMock).toHaveBeenCalledTimes(1)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('差旅报销')
  })

  it('加载失败 → snackbar.error(加载失败)，不抛错', async () => {
    requestsMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    // 源码 catch 忽略 err，统一提示 loadFailed
    expect(snackMock.error).toHaveBeenCalledWith('加载失败')
    expect(wrapper.exists()).toBe(true)
  })

  it('新建：打开「提交审批」弹窗后空表单保存 → 校验错误且不调用 createRequest', async () => {
    const wrapper = mountView()
    await flushPromises()

    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('提交审批'))
    expect(addBtn).toBeTruthy()
    await addBtn!.trigger('click')
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存'))
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(createMock).not.toHaveBeenCalled()
    expect(snackMock.error).toHaveBeenCalledWith('请填写标题、金额和事由')
  })
})

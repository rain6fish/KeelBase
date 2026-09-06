// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { instancesMock, snackMock, pushMock } = vi.hoisted(() => ({
  instancesMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  pushMock: vi.fn(),
}))

vi.mock('@/api/flow', () => ({
  flowApi: { myInstances: instancesMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import ElementPlus from 'element-plus'
import FlowInstancesView from '../FlowInstancesView.vue'

const instance = {
  id: 1,
  definitionId: 'leave',
  definitionName: '请假审批',
  state: 'running',
  initiatorId: 1,
  pendingTasks: 1,
  createdAt: '2026-09-01T08:00:00Z',
  updatedAt: '2026-09-01T08:00:00Z',
}

// PageHeader 渲染标题槽：stub 透传默认槽，让「刷新」按钮暴露可驱动
const PageHeaderStub = defineComponent({ template: '<div><slot /></div>' })

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(FlowInstancesView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        teleport: true,
        AppIcon: true,
        PageHeader: PageHeaderStub,
        StatusChip: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  instancesMock.mockResolvedValue([])
})

describe('FlowInstancesView（工作台·我的流程）', () => {
  it('挂载 → 调用 flowApi.myInstances() 并渲染流程行', async () => {
    instancesMock.mockResolvedValue([instance])

    const wrapper = mountView()
    await flushPromises()

    expect(instancesMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('请假审批')
  })

  it('空列表 → 页面不抛错正常渲染', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(instancesMock).toHaveBeenCalledTimes(1)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('请假审批')
  })

  it('加载失败 → snackbar.error(加载失败)，不抛错', async () => {
    instancesMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    // 源码 catch 忽略 err，统一提示 loadFailed
    expect(snackMock.error).toHaveBeenCalledWith('加载失败')
    expect(wrapper.exists()).toBe(true)
  })

  it('点击「刷新」→ 重新拉取列表', async () => {
    instancesMock.mockResolvedValue([instance])

    const wrapper = mountView()
    await flushPromises()
    expect(instancesMock).toHaveBeenCalledTimes(1)

    const btn = wrapper.findAll('button').find((b) => b.text().includes('刷新'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(instancesMock).toHaveBeenCalledTimes(2)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { instanceMock, errorMock } = vi.hoisted(() => ({
  instanceMock: vi.fn(),
  errorMock: vi.fn(),
}))

vi.mock('@/api/flow', () => ({ flowApi: { instance: instanceMock } }))
vi.mock('@/stores/snackbar', () => ({ useSnackbarStore: () => ({ error: errorMock }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '1' } }) }))

import ElementPlus from 'element-plus'
import FlowInstanceDetailView from '../FlowInstanceDetailView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(FlowInstanceDetailView, {
    global: { plugins: [i18n, ElementPlus], stubs: { PageHeader: true, AppIcon: true } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FlowInstanceDetailView（A-7 审批链可视化）', () => {
  it('渲染发起 → 每级审批（谁/结果/意见） → 终态 的审批链', async () => {
    instanceMock.mockResolvedValue({
      id: 1,
      definitionId: 'leave_approval',
      definitionName: '请假审批',
      state: 'completed',
      initiatorId: 5,
      initiatorName: 'alice',
      createdAt: '2026-08-31',
      updatedAt: '2026-09-01',
      tasks: [
        { taskId: 10, nodeId: 'b', nodeName: '经理审批', assigneeId: 7, assigneeName: 'bob', status: 'approved', decisionNote: '同意', createdAt: '2026-08-31', updatedAt: '2026-09-01' },
      ],
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('leave_approval')
    expect(wrapper.text()).toContain('alice 发起流程')
    expect(wrapper.text()).toContain('经理审批')
    expect(wrapper.text()).toContain('bob 通过')
    expect(wrapper.text()).toContain('同意')
    expect(wrapper.text()).toContain('已完成')
    wrapper.unmount()
  })

  it('加载失败 → snackbar.error', async () => {
    instanceMock.mockRejectedValue(new Error('流程加载失败'))
    const wrapper = mountView()
    await flushPromises()
    expect(errorMock).toHaveBeenCalledWith('加载失败')
    wrapper.unmount()
  })
})

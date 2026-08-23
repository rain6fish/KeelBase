import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { approvalsMock, decidedMock, decideMock, errorMock, successMock } = vi.hoisted(() => ({
  approvalsMock: vi.fn(),
  decidedMock: vi.fn(),
  decideMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: {
    approvals: approvalsMock,
    decidedApprovals: decidedMock,
    decideApproval: decideMock,
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import AiApprovalsView from '../AiApprovalsView.vue'

const AppTableStub = defineComponent({
  name: 'AppTable',
  props: ['headers', 'items', 'loading'],
  template:
    '<div class="app-table-stub"><template v-for="item in items" :key="item.id"><slot name="item.actions" :item="item" /></template></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiApprovalsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: AppTableStub,
        StatusChip: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiApprovalsView', () => {
  it('挂载 → 并行调用 approvals + decidedApprovals', async () => {
    approvalsMock.mockResolvedValue([
      { id: 1, token: 't1', toolName: 'create_event', args: '{"title":"x"}', operatorId: 'u1', conversationId: null, riskLevel: 'R4', status: 'pending', createdAt: '2026-08-21' },
    ])
    decidedMock.mockResolvedValue([
      { id: 2, token: 't2', toolName: 'create_todo', args: '{"title":"y"}', operatorId: 'u2', conversationId: null, riskLevel: 'R4', status: 'approved', approverId: 'u3', decidedAt: '2026-08-21', createdAt: '2026-08-20' },
    ])

    mountView()
    await flushPromises()

    expect(approvalsMock).toHaveBeenCalledTimes(1)
    expect(decidedMock).toHaveBeenCalledTimes(1)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    approvalsMock.mockRejectedValue(new Error('审批服务异常'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('审批服务异常')
  })

  it('批准 → 调用 decideApproval(token, approve) + success + 刷新', async () => {
    approvalsMock.mockResolvedValue([
      { id: 1, token: 'tok-1', toolName: 'create_event', args: '{}', operatorId: 'u1', conversationId: null, riskLevel: 'R4', status: 'pending', createdAt: '2026-08-21' },
    ])
    decidedMock.mockResolvedValue([])
    decideMock.mockResolvedValue({ ok: true, success: true })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--success').trigger('click')
    await flushPromises()

    expect(decideMock).toHaveBeenCalledWith('tok-1', 'approve')
    expect(successMock).toHaveBeenCalledWith('已批准并执行')
    expect(approvalsMock).toHaveBeenCalledTimes(2)
  })

  it('拒绝 → 调用 decideApproval(token, decline)', async () => {
    approvalsMock.mockResolvedValue([
      { id: 2, token: 'tok-2', toolName: 'create_event', args: '{}', operatorId: 'u1', conversationId: null, riskLevel: 'R4', status: 'pending', createdAt: '2026-08-21' },
    ])
    decidedMock.mockResolvedValue([])
    decideMock.mockResolvedValue({ ok: true })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--danger').trigger('click')
    await flushPromises()

    expect(decideMock).toHaveBeenCalledWith('tok-2', 'decline')
    expect(successMock).toHaveBeenCalledWith('已拒绝')
  })
})

// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { getMock, decideMock, snackMock, useRouteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  decideMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  useRouteMock: vi.fn(),
}))

vi.mock('@/api/approval', () => ({
  approvalApi: { getRequest: getMock, review: vi.fn(), decide: decideMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))
vi.mock('vue-router', () => ({
  useRoute: () => useRouteMock(),
}))

import ElementPlus from 'element-plus'
import ApprovalRequestDetailView from '../ApprovalRequestDetailView.vue'

// PageHeader stub：渲染 title/subtitle + 透传默认槽（头部行为史按钮可驱动）
const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="ph-stub"><div class="ph-title">{{ title }}</div><div v-if="subtitle" class="ph-subtitle">{{ subtitle }}</div><slot /></div>',
})

const baseReq = {
  id: 1,
  type: 'reimbursement',
  amount: 1234.5,
  reason: '上海出差住宿交通',
  riskLevel: 'medium',
  requesterName: 'alex',
  requesterId: 1,
  createdAt: '2026-09-01T10:00:00Z',
}

function mountView() {
  useRouteMock.mockReturnValue({ params: { id: '1' }, query: {} })
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(ApprovalRequestDetailView, {
    global: {
      plugins: [i18n, ElementPlus],
      // BusinessHistoryDrawer 仅在 modelValue=true 时拉取；stub 聚焦审批详情本体
      stubs: { PageHeader: PageHeaderStub, AppIcon: true, BusinessHistoryDrawer: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ApprovalRequestDetailView（AI Approval 审批详情）', () => {
  it('挂载 → 按路由 id 拉取审批并渲染标题/类型/金额/事由/预审建议', async () => {
    getMock.mockResolvedValue({
      ...baseReq,
      title: 'Q3 差旅报销',
      status: 'pending',
      aiRecommendation: '单笔在政策限额内，建议自动通过',
    })

    const wrapper = mountView()
    await flushPromises()

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('Q3 差旅报销') // PageHeader 标题 = 审批标题
    expect(wrapper.text()).toContain('报销') // 类型标签
    expect(wrapper.text()).toContain('¥1234.50') // 金额 toFixed(2)
    expect(wrapper.text()).toContain('上海出差住宿交通')
    expect(wrapper.text()).toContain('AI 预审建议')
    expect(wrapper.text()).toContain('单笔在政策限额内，建议自动通过')
    // pending → 显示「AI 预审」操作按钮
    expect(wrapper.text()).toContain('AI 预审（按政策分级）')
  })

  it('加载失败 → snackbar 加载失败，不抛错', async () => {
    getMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('加载失败')
    expect(wrapper.exists()).toBe(true)
  })

  it('needs_review → 渲染通过/驳回按钮；点通过 → decide(id, approved) + 成功提示', async () => {
    getMock.mockResolvedValue({
      ...baseReq,
      title: '服务器采购',
      type: 'purchase',
      status: 'needs_review',
      riskLevel: 'high',
      aiRecommendation: '金额超阈值，需人工复核',
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('服务器采购')
    expect(wrapper.text()).toContain('待人工复核')
    const approveBtn = wrapper.findAll('button').find((b) => b.text().includes('通过'))
    expect(approveBtn).toBeTruthy()
    const rejectBtn = wrapper.findAll('button').find((b) => b.text().includes('驳回'))
    expect(rejectBtn).toBeTruthy()

    decideMock.mockResolvedValue({ ...baseReq, title: '服务器采购', status: 'approved' })
    await approveBtn!.trigger('click')
    await flushPromises()

    expect(decideMock).toHaveBeenCalledWith(1, 'approved')
    expect(snackMock.success).toHaveBeenCalledWith('已决定')
  })
})

// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { detailMock, analyzeMock, snackMock, useRouteMock } = vi.hoisted(() => ({
  detailMock: vi.fn(),
  analyzeMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  useRouteMock: vi.fn(),
}))

vi.mock('@/api/pm', () => ({
  pmApi: { detail: detailMock, analyze: analyzeMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))
vi.mock('vue-router', () => ({
  useRoute: () => useRouteMock(),
}))

import ElementPlus from 'element-plus'
import PmProjectDetailView from '../PmProjectDetailView.vue'

// PageHeader stub：渲染 title/subtitle + 透传默认槽（头部操作按钮可驱动）
const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="ph-stub"><div class="ph-title">{{ title }}</div><div v-if="subtitle" class="ph-subtitle">{{ subtitle }}</div><slot /></div>',
})

const detailFull = {
  project: { id: 1, name: 'ERP 升级', description: '把旧库存系统迁移到新平台', status: 'active', riskLevel: 'medium' },
  memberCount: 6,
  milestones: [{ id: 1, projectId: 1, title: '需求评审完成', dueDate: '2026-08-20', status: 'done' }],
  tasks: [
    { id: 1, projectId: 1, title: '数据库迁移脚本', status: 'pending' },
    { id: 2, projectId: 1, title: '历史数据清洗', status: 'completed' },
  ],
  risks: [{ id: 1, projectId: 1, level: 'high', reason: '外部依赖未就绪' }],
}

function mountView() {
  useRouteMock.mockReturnValue({ params: { id: '1' }, query: {} })
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(PmProjectDetailView, {
    global: {
      plugins: [i18n, ElementPlus],
      // 重型抽屉在挂载时无需驱动；stub 聚焦项目详情本体
      stubs: { PageHeader: PageHeaderStub, AppIcon: true, PmCopilotDrawer: true, BusinessHistoryDrawer: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PmProjectDetailView（AI 项目管理·项目详情）', () => {
  it('挂载 → 按路由 id 拉取详情并渲染项目/里程碑/任务/风险', async () => {
    detailMock.mockResolvedValue(detailFull)

    const wrapper = mountView()
    await flushPromises()

    expect(detailMock).toHaveBeenCalledTimes(1)
    expect(detailMock).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('ERP 升级') // PageHeader 标题 = 项目名
    expect(wrapper.text()).toContain('把旧库存系统迁移到新平台')
    expect(wrapper.text()).toContain('进行中') // 项目状态标签
    expect(wrapper.text()).toContain('需求评审完成')
    expect(wrapper.text()).toContain('数据库迁移脚本')
    expect(wrapper.text()).toContain('历史数据清洗')
    expect(wrapper.text()).toContain('外部依赖未就绪') // 风险 reason
    expect(wrapper.text()).toContain('6')
    expect(wrapper.text()).toContain('成员')
  })

  it('空列表 → 渲染暂无里程碑/任务/风险占位', async () => {
    detailMock.mockResolvedValue({
      project: { id: 1, name: '新项目', description: null, status: 'planned', riskLevel: 'low' },
      memberCount: 0,
      milestones: [],
      tasks: [],
      risks: [],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无里程碑')
    expect(wrapper.text()).toContain('暂无任务')
    expect(wrapper.text()).toContain('暂无风险记录')
    expect(wrapper.text()).toContain('规划中')
  })

  it('加载失败 → snackbar 加载失败，不抛错', async () => {
    detailMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('加载失败')
    expect(wrapper.exists()).toBe(true)
  })

  it('风险分析 → 调 analyze(id) + 成功提示 + 渲染风险理由', async () => {
    detailMock.mockResolvedValue({
      project: { id: 1, name: '新项目', description: null, status: 'active', riskLevel: 'low' },
      memberCount: 0,
      milestones: [],
      tasks: [],
      risks: [],
    })
    analyzeMock.mockResolvedValue({ level: 'critical', score: 9, reasons: ['关键路径存在延期风险'] })

    const wrapper = mountView()
    await flushPromises()

    const analyzeBtn = wrapper.findAll('button').find((b) => b.text().includes('风险分析'))
    expect(analyzeBtn).toBeTruthy()
    await analyzeBtn!.trigger('click')
    await flushPromises()

    expect(analyzeMock).toHaveBeenCalledWith(1)
    expect(snackMock.success).toHaveBeenCalledWith('分析完成')
    expect(wrapper.text()).toContain('关键路径存在延期风险')
  })
})

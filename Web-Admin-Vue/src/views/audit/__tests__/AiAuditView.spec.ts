// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { logsMock, statsMock, verifyMock, errorMock, successMock, csvMock } = vi.hoisted(() => ({
  logsMock: vi.fn(),
  statsMock: vi.fn(),
  verifyMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
  csvMock: vi.fn(),
}))

vi.mock('@/api/audit', () => ({
  auditApi: { logs: logsMock, stats: statsMock, verify: verifyMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))
vi.mock('@/utils/csv', () => ({ downloadCsv: csvMock }))
// M2 Agent→审计联动（ffe096d）组件读 route.query.agentId，测试需 mock useRoute
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

import ElementPlus from 'element-plus'
import AiAuditView from '../AiAuditView.vue'

// AppTable stub：渲染 items 的 action 列插槽，让 D2 人类语言标签可断言
const AppTableStub = defineComponent({
  name: 'AppTable',
  props: ['headers', 'items'],
  template:
    '<div class="app-table-stub"><template v-for="item in items" :key="item.id"><slot name="item.action" :item="item" /></template></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiAuditView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: AppTableStub,
        StatCard: true,
        RangeFilter: true,
        StatusChip: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ valid: true, checked: 0, brokenIndex: null, chain: [] })
})

describe('AiAuditView', () => {
  it('挂载 → 并行调用 auditApi.logs + stats', async () => {
    logsMock.mockResolvedValue([{ id: 1, action: 'query_events', createdAt: '2026-08-20' }])
    statsMock.mockResolvedValue({ totalTokens: 100 })

    mountView()
    await flushPromises()

    expect(logsMock).toHaveBeenCalledWith({ userId: undefined, limit: 50, since: undefined })
    expect(statsMock).toHaveBeenCalledWith(undefined)
  })

  it('A-8：选「AI 越权/被拒」→ 携带 denied=true 走服务端越权专门视图', async () => {
    logsMock.mockResolvedValue([])
    statsMock.mockResolvedValue({ totalTokens: 100 })

    const wrapper = mountView()
    await flushPromises()
    // 初始 load：主日志查询不带 denied（errorLogs 并行调用是 limit:5 的 isError 查询，用 limit:50 区分）
    expect(logsMock).toHaveBeenCalledWith({ limit: 50, denied: undefined })

    // 选择行为类型「denied」→ 点筛选按钮 → load 携带 denied=true
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'denied')
    await wrapper.find('button.el-button--primary').trigger('click')
    await flushPromises()

    expect(logsMock).toHaveBeenCalledWith({ limit: 50, denied: 'true' })
    wrapper.unmount()
  })

  it('加载失败 → snackbar.error 提示', async () => {
    logsMock.mockRejectedValue(new Error('审计服务异常'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('审计服务异常')
  })

  it('action 列渲染人类语言标签（D2：actionKey 走 i18n，fallback 到 actionLabel）', async () => {
    logsMock.mockResolvedValue([
      { id: 1, action: 'tool_call', actionKey: 'ai.toolCall', actionLabel: 'AI · Tool call', detail: 'Tool: create_followup_task', createdAt: '2026-08-20', isError: false },
      { id: 2, action: 'chat', actionKey: 'ai.chat', actionLabel: 'AI · Chat', createdAt: '2026-08-20', isError: false },
      { id: 3, action: 'custom_action', actionKey: 'ai.custom_action', actionLabel: 'AI · Custom action', createdAt: '2026-08-20', isError: false },
    ])
    statsMock.mockResolvedValue({ totalTokens: 100 })

    const wrapper = mountView()
    await flushPromises()

    // zh i18n 有条目 → 渲染 i18n 文案
    expect(wrapper.text()).toContain('AI · 工具调用')
    expect(wrapper.text()).toContain('AI · 对话')
    // 未知 actionKey（i18n 无条目）→ fallback 到后端 actionLabel
    expect(wrapper.text()).toContain('AI · Custom action')
    wrapper.unmount()
  })
})

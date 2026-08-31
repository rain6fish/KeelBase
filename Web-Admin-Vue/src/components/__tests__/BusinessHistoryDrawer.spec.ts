import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import BusinessHistoryDrawer from '../BusinessHistoryDrawer.vue'

vi.mock('@/api/aiTools', () => ({ aiToolsApi: { entityHistory: vi.fn() } }))
import { aiToolsApi } from '@/api/aiTools'

function mountDrawer() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(BusinessHistoryDrawer, {
    global: { plugins: [i18n] },
    props: { modelValue: true, resultType: 'crm_task', resultId: 42 },
  })
}

describe('BusinessHistoryDrawer（§22.16 A-2 业务实体行为史）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('渲染目标状态卡 + 聚合时间线（source 标签 + 业务事件 + REST）', async () => {
    ;(aiToolsApi.entityHistory as any).mockResolvedValue({
      target: { exists: true, title: '跟进', status: 'open', deletedAt: null },
      events: [
        { id: 'ai-trace-1', source: 'ai-trace', time: '2026-08-31T00:30:00Z', businessEvent: 'CustomerRiskAssessed', toolName: 'analyze_customer_risk', evidence: '{"decision":"high"}' },
        { id: 'ai-effect-1', source: 'ai-side-effect', time: '2026-08-31T01:00:00Z', businessEvent: 'FollowupTaskCreated', toolName: 'create_followup_task', before: null, after: '{"id":42,"title":"跟进"}' },
        { id: 'rest-1', source: 'rest-write', time: '2026-08-31T02:00:00Z', method: 'POST', path: '/api/v1/crm/tasks', action: 'CREATE', changes: '[{"field":"status"}]' },
      ],
    })
    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('跟进')
    expect(wrapper.text()).toContain('open')
    expect(wrapper.text()).toContain('AI 决策')
    expect(wrapper.text()).toContain('AI 副作用')
    expect(wrapper.text()).toContain('REST 写')
    expect(wrapper.text()).toContain('CustomerRiskAssessed')
    expect(wrapper.text()).toContain('FollowupTaskCreated')
    expect(wrapper.text()).toContain('POST')
  })

  it('空态', async () => {
    ;(aiToolsApi.entityHistory as any).mockResolvedValue({ target: { exists: false }, events: [] })
    const wrapper = mountDrawer()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无 AI/REST 行为记录')
  })

  it('目标已删除显示软删提示', async () => {
    ;(aiToolsApi.entityHistory as any).mockResolvedValue({
      target: { exists: true, title: '跟进', status: null, deletedAt: '2026-08-31T03:00:00Z' },
      events: [],
    })
    const wrapper = mountDrawer()
    await flushPromises()
    expect(wrapper.text()).toContain('已删除')
  })
})

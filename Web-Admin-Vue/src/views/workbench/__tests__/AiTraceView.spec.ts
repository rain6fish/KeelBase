import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { conversationsMock, traceMock, revokeMock } = vi.hoisted(() => ({
  conversationsMock: vi.fn(),
  traceMock: vi.fn(),
  revokeMock: vi.fn(),
}))

vi.mock('@/api/aiTrace', () => ({
  aiTraceApi: { conversations: conversationsMock, trace: traceMock, revokeEffect: revokeMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import ElementPlus from 'element-plus'
import AiTraceView from '../AiTraceView.vue'

const conv = {
  id: 'conv-1',
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  summary: null,
  createdAt: '2026-08-25T10:00:00Z',
  lastActivityAt: '2026-08-25T10:00:00Z',
  messages: [{ role: 'user', content: '查一下客户', timestamp: '2026-08-25T10:00:00Z' }],
}

const steps = [
  { id: 'msg-0', type: 'input', time: '2026-08-25T10:00:00Z', content: '查一下客户' },
  {
    id: 'tool-1',
    type: 'tool_call',
    time: '2026-08-25T10:00:01Z',
    toolName: 'query_customers',
    args: '{}',
    success: true,
    agentId: 'research-agent',
    callerAgentId: 'orchestrator',
  },
  { id: 'conf-2', type: 'confirmation', time: '2026-08-25T10:00:02Z', toolName: 'create_followup_task', args: '{}', outcome: 'approve' },
  {
    id: 'effect-3',
    type: 'effect',
    time: '2026-08-25T10:00:03Z',
    toolName: 'create_followup_task',
    effect: { effectId: 1, resultType: 'crm_task', resultId: 42, targetTitle: '跟进', revocable: true },
  },
]

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiTraceView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, StatusChip: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiTraceView', () => {
  it('加载对话列表（el-select 提供选项）', async () => {
    conversationsMock.mockResolvedValue([conv])

    const wrapper = mountView()
    await flushPromises()

    expect(conversationsMock).toHaveBeenCalledTimes(1)
    // 对话标题来自首条 user 消息；el-select 折叠态不渲染选项文本，只显示 placeholder
    expect(wrapper.text()).toContain('选择对话')
  })

  it('选中对话 → 渲染 trace 步骤来源标签（人/AI/系统）+ 子 agent 归责', async () => {
    conversationsMock.mockResolvedValue([conv])
    traceMock.mockResolvedValue({ conversation: conv, steps })

    const wrapper = mountView()
    await flushPromises()

    const select = wrapper.findComponent({ name: 'ElSelect' })
    await select.vm.$emit('update:modelValue', 'conv-1')
    await flushPromises()

    expect(traceMock).toHaveBeenCalledWith('conv-1')
    const tags = wrapper.findAll('.el-tag').map((t) => t.text().trim())
    // input → 人；tool_call → AI + research-agent；confirmation → 人；effect → 系统
    expect(tags).toContain('人')
    expect(tags).toContain('AI')
    expect(tags).toContain('系统')
    expect(wrapper.text()).toContain('research-agent')
  })

  it('trace 失败 → 渲染错误提示', async () => {
    conversationsMock.mockResolvedValue([conv])
    traceMock.mockRejectedValue(new Error('boom'))

    const wrapper = mountView()
    await flushPromises()

    const select = wrapper.findComponent({ name: 'ElSelect' })
    await select.vm.$emit('update:modelValue', 'conv-1')
    await flushPromises()

    // trace 失败 → traceError 显示 err.message
    expect(wrapper.text()).toContain('boom')
  })
})

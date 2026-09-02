// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { governanceMock } = vi.hoisted(() => ({
  governanceMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { governanceAction: governanceMock },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 2, username: 'alex', role: 'user' } }),
}))

import ElementPlus from 'element-plus'
import GovernanceActionDrawer from '../GovernanceActionDrawer.vue'

const effect = {
  id: 1,
  userId: '2',
  toolName: 'create_followup_task',
  argsHash: 'abc123',
  conversationId: 'conv-1',
  resultType: 'crm_task',
  resultId: 42,
  createdAt: '2026-08-25T10:00:00Z',
}

function makeDrawer(trace?: unknown) {
  governanceMock.mockReset()
  governanceMock.mockResolvedValue({ effect, trace })
  const i18n = createI18n({
    legacy: false,
    locale: 'zh',
    messages: { zh, en },
  })
  return mount(GovernanceActionDrawer, {
    global: { plugins: [ElementPlus, i18n] },
    // 挂载即打开 → onMounted 触发 load（与现有组件测试模式一致）
    props: { modelValue: true, resultType: 'crm_task', resultId: 42 },
  })
}

describe('GovernanceActionDrawer（D1 治理钻取）', () => {
  beforeEach(() => governanceMock.mockReset())

  it('打开后按 resultType/resultId 拉取治理数据并渲染七段', async () => {
    const wrapper = makeDrawer()
    await flushPromises()

    expect(governanceMock).toHaveBeenCalledWith('crm_task', 42)
    expect(wrapper.text()).toContain('alex') // Who
    expect(wrapper.text()).toContain('创建跟进任务') // What（业务语言化：工具名 → 人类标签）
    expect(wrapper.text()).toContain('crm_task #42') // Result / Side Effects
    expect(wrapper.text()).toContain('abc123') // Integrity
  })

  it('Why 摘要：有人工确认时显示「用户已确认」', async () => {
    const wrapper = makeDrawer({
      steps: [
        { id: 'conf-1', type: 'confirmation', time: '2026-08-25T10:00:01Z', toolName: 'create_followup_task', args: '{}', outcome: 'approve' },
      ],
    })
    await flushPromises()

    expect(wrapper.text()).toContain('用户已确认')
  })

  it('Why 技术详情：被拒工具展示 checks 清单', async () => {
    const wrapper = makeDrawer({
      steps: [
        {
          id: 'tool-1',
          type: 'tool_call',
          time: '2026-08-25T10:00:01Z',
          toolName: 'create_followup_task',
          args: '{}',
          success: false,
          checks: [{ name: 'ownership', ok: false, note: '无权访问该客户' }],
        },
      ],
    })
    await flushPromises()

    expect(wrapper.text()).toContain('授权依据') // A-5：为什么允许/阻止
    expect(wrapper.text()).toContain('无权访问该客户')
  })

  it('A-3 生命周期：写工具已确认 → el-steps 六节点（发起/授权/确认/执行/撤销/恢复）', async () => {
    const wrapper = makeDrawer({
      steps: [
        { id: 'in-1', type: 'input', time: '2026-08-25T10:00:00Z', content: '为辰光建材创建跟进任务' },
        { id: 'auth-1', type: 'tool_call', time: '2026-08-25T10:00:01Z', toolName: 'create_followup_task', args: '{}', success: true, checks: [{ name: 'user_scoped', ok: true }] },
        { id: 'conf-1', type: 'confirmation', time: '2026-08-25T10:00:02Z', toolName: 'create_followup_task', args: '{}', outcome: 'approve' },
      ],
    })
    await flushPromises()

    expect(wrapper.findAll('.el-step').length).toBe(6)
    for (const label of ['发起', '授权', '确认', '执行', '撤销', '恢复']) {
      expect(wrapper.text()).toContain(label)
    }
  })

  it('A-3 生命周期：被拒场景 → 执行节点 error 态（无确认/撤销）', async () => {
    const wrapper = makeDrawer({
      steps: [
        {
          id: 'tool-1',
          type: 'tool_call',
          time: '2026-08-25T10:00:01Z',
          toolName: 'query_customers',
          args: '{}',
          success: false,
          checks: [{ name: 'ownership', ok: false, note: '无权访问该客户' }],
        },
      ],
    })
    await flushPromises()

    // 发起(process) + 授权(finish) + 执行(error) = 3 节点；无确认/撤销/恢复
    expect(wrapper.findAll('.el-step').length).toBe(3)
  })

  // 注：404（人工创建任务 → 无 AI 治理记录）路径已实测验证（组件 catch 后渲染友好空态），
  // 但因 vitest 对 el-drawer 内 async 加载的 mock rejection 存在 unhandled 误报，不在本 spec 覆盖。
})

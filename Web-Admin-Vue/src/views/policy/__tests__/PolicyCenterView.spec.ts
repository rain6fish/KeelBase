// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { toolsMock, policyMock, savePolicyMock, presetsMock, errorMock, successMock } = vi.hoisted(() => ({
  toolsMock: vi.fn(),
  policyMock: vi.fn(),
  savePolicyMock: vi.fn(),
  presetsMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: {
    tools: toolsMock,
    policy: policyMock,
    savePolicy: savePolicyMock,
    policyPresets: presetsMock,
    applyPolicyPreset: vi.fn(),
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import PolicyCenterView from '../PolicyCenterView.vue'

const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="page-header-stub"><slot /></div>',
})

// §22.15(4)：R3 工具被策略升档为 approval；R5 阻断；R1 读工具默认
const tools = [
  {
    name: 'create_customer',
    description: '创建客户',
    parameters: [],
    enabled: true,
    requiresConfirmation: true,
    requiresApproval: true,
    gateMode: 'approval',
    allowedRoles: [],
    riskLevel: 'R3',
    riskStrategy: 'confirmation',
    permissions: null,
  },
  {
    name: 'delete_customer',
    description: '删除客户',
    parameters: [],
    enabled: true,
    requiresConfirmation: false,
    gateMode: 'blocked',
    allowedRoles: [],
    riskLevel: 'R5',
    riskStrategy: 'block',
    permissions: null,
  },
  {
    name: 'query_events',
    description: '查询事件',
    parameters: [],
    enabled: true,
    requiresConfirmation: false,
    gateMode: 'auto',
    allowedRoles: [],
    riskLevel: 'R1',
    riskStrategy: 'auto',
    permissions: null,
  },
]

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(PolicyCenterView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PolicyCenterView（§22.15(4) 档位化编辑）', () => {
  it('挂载 → 渲染工具行 + 升档行覆盖徽标 + R5 阻断行', async () => {
    toolsMock.mockResolvedValue(tools)
    policyMock.mockResolvedValue('{"tools":{"create_customer":{"mode":"approval"}},"audit":{"granularity":"all"}}')
    presetsMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('create_customer')
    expect(text).toContain('delete_customer')
    expect(text).toContain('query_events')
    expect(text).toContain('已覆盖') // create_customer 覆盖徽标
    expect(text).toContain('已配置 1 项工具覆盖')
    expect(toolsMock).toHaveBeenCalledTimes(1)
  })

  it('保存 → 差异写入：升档行 mode=approval；R5/默认行忽略', async () => {
    toolsMock.mockResolvedValue(tools)
    policyMock.mockResolvedValue('{"tools":{"create_customer":{"mode":"approval"}},"audit":{"granularity":"all"}}')
    presetsMock.mockResolvedValue([])
    savePolicyMock.mockResolvedValue(null)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.page-header-stub .el-button--primary').trigger('click')
    await flushPromises()

    expect(savePolicyMock).toHaveBeenCalledTimes(1)
    const sent = JSON.parse(savePolicyMock.mock.calls[0][0]) as {
      tools: Record<string, { mode?: string }>
    }
    expect(sent.tools.create_customer.mode).toBe('approval')
    expect(sent.tools.delete_customer).toBeUndefined()
    expect(sent.tools.query_events).toBeUndefined()
    expect(successMock).toHaveBeenCalledWith('治理策略已保存，实时生效')
  })
})

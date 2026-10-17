// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { chainMock, toolsMock, usersMock, explainMock, explainTargetMock, provenanceMock, authState } =
  vi.hoisted(() => ({
    chainMock: vi.fn(),
    toolsMock: vi.fn(),
    usersMock: vi.fn(),
    explainMock: vi.fn(),
    explainTargetMock: vi.fn(),
    provenanceMock: vi.fn(),
    authState: {
      user: { id: 1, username: 'alex', role: 'user' } as { id: number; username: string; role: string },
      permissions: null as null | {
        role: string
        basis: string
        resources: Array<{ subject: string; scope: 'all' | 'own'; actions: string[]; reason: string }>
      },
      isAdmin: false,
      loadPermissions: vi.fn(),
    },
  }))

vi.mock('@/api/auth', () => ({
  authApi: {
    authorizationChain: chainMock,
    myPermissions: vi.fn(),
    explain: explainMock,
    explainTarget: explainTargetMock,
  },
}))
vi.mock('@/api/aiTools', () => ({ aiToolsApi: { tools: toolsMock } }))
vi.mock('@/api/provenance', () => ({ provenanceApi: { get: provenanceMock } }))
vi.mock('@/api/users', () => ({ usersApi: { list: usersMock } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

import ElementPlus from 'element-plus'
import PermissionsView from '../PermissionsView.vue'

const CHAIN = {
  user: { id: 2, username: 'alex', role: 'user' },
  grants: [
    { policy: '普通用户：可管理本人拥有的资源', resource: 'Event', scope: 'own' },
    { policy: '普通用户：可管理本人拥有的资源', resource: 'Todo', scope: 'own' },
  ],
  toolPolicies: [
    { toolName: 'query_customers', enabled: true, allowedRoles: ['user', 'admin'], riskLevel: 'R1' },
    { toolName: 'create_event', enabled: false, allowedRoles: ['user'], riskLevel: 'R3' },
  ],
  effectiveSince: '2026-08-31T00:00:00.000Z',
}

function mountView(locale = 'zh') {
  const i18n = createI18n({ legacy: false, locale, messages: { zh, en } })
  return mount(PermissionsView, { global: { plugins: [ElementPlus, i18n] } })
}

describe('PermissionsView（§22.15 (4) 数据权限边界视图）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chainMock.mockResolvedValue(CHAIN)
    toolsMock.mockResolvedValue([])
    provenanceMock.mockResolvedValue({
      source: {},
      runtime: {
        preset: 'full',
        businessModules: [],
        aiToolFingerprint: { total: 57, read: 38, write: 19, byRisk: { R1: 36, R2: 1, R3: 18, R4: 1, R5: 1 } },
      },
    })
    usersMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 })
    explainMock.mockResolvedValue({
      action: 'read',
      subject: 'CrmCustomer',
      allowed: false,
      reason: '需要管理员权限，或该资源不在你的可管理范围',
      deniedBy: 'casl',
    })
    authState.user = { id: 1, username: 'alex', role: 'user' }
    authState.isAdmin = false
    authState.permissions = {
      role: 'user',
      basis: '普通用户：可管理本人拥有的资源（行级所有权条件）',
      resources: [
        { subject: 'Event', scope: 'own', actions: ['create', 'read', 'update', 'delete'], reason: '只能操作自己的数据' },
        { subject: 'Report', scope: 'own', actions: ['read'], reason: '只能操作自己的数据' },
      ],
    }
  })

  it('四问都有落点：谁 / 数据 / 工具 / 边界，且判定文字来自服务端字段', async () => {
    const wrapper = mountView()
    await flushPromises()

    // Who: identity + server basis
    expect(wrapper.find('[data-testid="permission-role"]').text()).toContain('alex')
    expect(wrapper.find('[data-testid="boundary-basis"]').text()).toContain('行级所有权条件')
    expect(wrapper.find('[data-testid="chain-effective"]').text()).toContain('2026-08-31')

    // Data: scopes/actions from the capability list, read-only summarised from server actions
    const dataText = wrapper.find('[data-testid="boundary-data"]').text()
    expect(dataText).toContain('Event')
    expect(dataText).toContain('Report')
    expect(dataText).toContain('own')
    expect(dataText).toContain('create')
    expect(wrapper.find('[data-testid="boundary-readonly"]').text()).toContain('只读')

    // Tools: non-admin sees the policy-configured subset from the chain
    const toolText = wrapper.find('[data-testid="boundary-tools"]').text()
    expect(toolText).toContain('query_customers')
    expect(toolText).toContain('create_event')
    expect(toolText).toContain('R3')
    expect(toolText).toContain('禁用')
    expect(toolText).not.toContain('门控档位')

    // Public fingerprint answers "how many / read-write / risk mix" for every role.
    const fp = wrapper.find('[data-testid="boundary-tool-fingerprint"]').text()
    expect(fp).toContain('57')
    expect(fp).toContain('38')
    expect(fp).toContain('R3 18')

    // Boundary: rules rendered
    expect(wrapper.find('[data-testid="boundary-edge"]').text()).toContain('403')
  })

  it('边界探针展示服务端决策与依据（POST /auth/permissions/explain）', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="boundary-probe-run"]').trigger('click')
    await flushPromises()

    expect(explainMock).toHaveBeenCalledWith('read', 'Event')
    const result = wrapper.find('[data-testid="boundary-probe-result"]')
    expect(result.text()).toContain('拒绝')
    expect(result.text()).toContain('需要管理员权限')
    expect(result.text()).toContain('casl')
  })

  it('管理员读完整工具注册表（含生效门控）并可选目标用户', async () => {
    authState.user = { id: 1, username: 'admin', role: 'admin' }
    authState.isAdmin = true
    authState.permissions = {
      role: 'admin',
      basis: '管理员角色：可管理全部资源',
      resources: [{ subject: 'all', scope: 'all', actions: ['create', 'read', 'update', 'delete'], reason: '管理员：可管理全部资源' }],
    }
    toolsMock.mockResolvedValue([
      {
        name: 'create_event',
        description: 'x',
        parameters: [],
        enabled: false,
        requiresConfirmation: false,
        requiresApproval: false,
        gateMode: 'blocked',
        allowedRoles: ['admin'],
        riskLevel: 'R5',
        permissions: null,
      },
    ])
    usersMock.mockResolvedValue({
      items: [{ id: 7, username: 'bob', email: 'b***@e.com', nickname: 'bob', role: 'user' }],
      total: 1,
      page: 1,
      limit: 100,
    })

    const wrapper = mountView()
    await flushPromises()

    expect(usersMock).toHaveBeenCalledWith(1, 100)
    const toolText = wrapper.find('[data-testid="boundary-tools"]').text()
    expect(toolText).toContain('create_event')
    expect(toolText).toContain('门控档位')
    expect(toolText).toContain('阻断')
    expect(toolText).toContain('R5')

    // English chrome is present too (bilingual, no hardcoded Chinese in the view).
    const enWrapper = mountView('en')
    await flushPromises()
    expect(enWrapper.find('[data-testid="boundary-data"]').text()).toContain('Allowed actions')
    expect(enWrapper.find('[data-testid="boundary-edge"]').text()).toContain('Beyond the boundary')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { chainMock, permsMock, loadPermissionsMock } = vi.hoisted(() => ({
  chainMock: vi.fn(),
  permsMock: vi.fn(),
  loadPermissionsMock: vi.fn(),
}))

vi.mock('@/api/auth', () => ({
  authApi: { authorizationChain: chainMock, myPermissions: permsMock },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { username: 'alex' },
    permissions: {
      role: 'user',
      basis: '普通用户：可管理本人拥有的资源（行级所有权条件）',
      resources: [{ subject: 'Event', scope: 'own', reason: '只能操作自己的数据' }],
    },
    isAdmin: false,
    loadPermissions: loadPermissionsMock,
  }),
}))

import ElementPlus from 'element-plus'
import PermissionsView from '../PermissionsView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(PermissionsView, { global: { plugins: [ElementPlus, i18n] } })
}

describe('PermissionsView（§22.16 A-5 授权链图）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chainMock.mockResolvedValue({
      user: { id: 42, username: 'alex', role: 'user' },
      grants: [
        { policy: '普通用户：可管理本人拥有的资源', resource: 'Event', scope: 'own' },
        { policy: '普通用户：可管理本人拥有的资源', resource: 'Todo', scope: 'own' },
      ],
      toolPolicies: [
        { toolName: 'query_customers', enabled: true, allowedRoles: ['user', 'admin'], riskLevel: 'R1' },
        { toolName: 'create_event', enabled: false, allowedRoles: ['user'], riskLevel: 'R3' },
      ],
      effectiveSince: '2026-08-31T00:00:00.000Z',
    })
  })

  it('渲染 5 节点授权链图：授权者→被授权者→策略→资源→生效期', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="chain-authorizer"]').text()).toContain('admin')
    expect(wrapper.find('[data-testid="permission-role"]').text()).toContain('alex')
    expect(wrapper.find('[data-testid="chain-effective"]').text()).toContain('2026-08-31')
    // 资源链式 tag（grant subject）
    const grants = wrapper.findAll('[data-testid="chain-grant"]')
    expect(grants.map((g) => g.text())).toEqual(['Event', 'Todo'])
    expect(chainMock).toHaveBeenCalled()
  })

  it('工具策略折叠展示（enabled 状态 + 风险级 + 角色白名单）', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('工具策略')
    expect(wrapper.text()).toContain('query_customers')
    expect(wrapper.text()).toContain('create_event')
    expect(wrapper.text()).toContain('R3')
    expect(wrapper.text()).toContain('禁用')
  })
})

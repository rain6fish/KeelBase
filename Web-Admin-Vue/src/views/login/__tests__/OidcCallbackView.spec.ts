import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const oidcLoginMock = vi.fn()
const replaceMock = vi.fn()
const authRole = vi.hoisted(() => ({ value: 'user' }))
const routeQuery = vi.hoisted((): { value: { code?: string } } => ({ value: { code: 'sso-code-123' } }))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    oidcLogin: oidcLoginMock,
    user: { role: authRole.value },
    errorMessage: 'OIDC 校验失败',
    status: 'loading',
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ replace: replaceMock }),
}))

import ElementPlus from 'element-plus'
import OidcCallbackView from '../OidcCallbackView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(OidcCallbackView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { AppLogo: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authRole.value = 'user'
  routeQuery.value = { code: 'sso-code-123' }
})

describe('OidcCallbackView', () => {
  it('有 code → 调 oidcLogin 且成功按角色回首页', async () => {
    oidcLoginMock.mockResolvedValue(true)
    mountView()
    await flushPromises()

    expect(oidcLoginMock).toHaveBeenCalledWith('sso-code-123', expect.stringContaining('#/auth/oidc/callback'))
    expect(replaceMock).toHaveBeenCalledWith('/403') // admin 构建非 admin → homeFor /403
  })

  it('admin 成功 → 回 /', async () => {
    authRole.value = 'admin'
    oidcLoginMock.mockResolvedValue(true)
    mountView()
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith('/')
  })

  it('无 code → 显示错误不调登录', async () => {
    routeQuery.value = {}
    const wrapper = mountView()
    await flushPromises()

    expect(oidcLoginMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('企业 SSO 登录失败')
  })

  it('登录失败 → 显示 store 错误', async () => {
    oidcLoginMock.mockResolvedValue(false)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('OIDC 校验失败')
    expect(replaceMock).not.toHaveBeenCalled()
  })
})

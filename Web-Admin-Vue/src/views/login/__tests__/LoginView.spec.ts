import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const loginMock = vi.fn()
const replaceMock = vi.fn()
const authRole = vi.hoisted(() => ({ value: 'user' }))
const oauthMocks = vi.hoisted(() => ({ oauthProviders: vi.fn(), oidcUrl: vi.fn() }))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    login: loginMock,
    get isAdmin() {
      return authRole.value === 'admin'
    },
    errorMessage: '',
    status: 'idle',
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/auth', () => ({
  authApi: { oauthProviders: oauthMocks.oauthProviders, oidcUrl: oauthMocks.oidcUrl },
}))

import ElementPlus from 'element-plus'
import LoginView from '../LoginView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(LoginView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { AppIcon: true, LangToggle: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authRole.value = 'user'
  oauthMocks.oauthProviders.mockResolvedValue({
    enabledProviders: [],
    providers: [],
    groups: { international: [], china: [], enterprise: [] },
  })
})

function stubLocation() {
  const hrefSetter = vi.fn()
  Object.defineProperty(window, 'location', {
    value: {
      origin: 'http://localhost',
      pathname: '/admin/',
      set href(v: string) {
        hrefSetter(v)
      },
      get href() {
        return ''
      },
    },
    writable: true,
    configurable: true,
  })
  return hrefSetter
}

describe('LoginView', () => {
  it('渲染登录表单（标题/用户名/密码/登录按钮）', () => {
    const wrapper = mountView()

    expect(wrapper.text()).toContain('管理控制台')
    expect(wrapper.findAll('input')).toHaveLength(2)
    expect(wrapper.text()).toContain('登录')
  })

  it('空用户名/密码提交 → 显示错误，不调用 login', async () => {
    const wrapper = mountView()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('登录失败')
  })

  it('填写并提交 → 调用 login 且成功后跳转 /workbench（非 admin）', async () => {
    loginMock.mockResolvedValue(true)
    const wrapper = mountView()

    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('alex')
    await inputs[1].setValue('123456')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginMock).toHaveBeenCalledWith('alex', '123456')
    expect(replaceMock).toHaveBeenCalledWith('/workbench')
  })

  it('登录失败 → 显示错误且不跳转', async () => {
    loginMock.mockResolvedValue(false)
    const wrapper = mountView()

    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('alex')
    await inputs[1].setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(replaceMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('登录失败')
  })

  it('无 oidc provider → 不显示企业 SSO 按钮', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('企业 SSO')
    expect(wrapper.findAll('input')).toHaveLength(2)
  })

  it('有 oidc provider → 显示企业 SSO 按钮，点击跳转 IdP', async () => {
    oauthMocks.oauthProviders.mockResolvedValue({
      enabledProviders: ['oidc'],
      providers: [],
      groups: { international: [], china: [], enterprise: [{ id: 'oidc', name: '企业 SSO' }] },
    })
    oauthMocks.oidcUrl.mockResolvedValue({ url: 'https://idp.example.com/realms/x/protocol/openid-connect/auth?client_id=c' })
    const setHref = stubLocation()

    const wrapper = mountView()
    await flushPromises()

    const sso = wrapper.findAll('button').find((b) => b.text() === '企业 SSO')
    expect(sso).toBeTruthy()

    await sso!.trigger('click')
    await flushPromises()

    expect(oauthMocks.oidcUrl).toHaveBeenCalled()
    expect(setHref).toHaveBeenCalledWith('https://idp.example.com/realms/x/protocol/openid-connect/auth?client_id=c')
  })

  it('oidc url 获取失败 → 显示错误', async () => {
    oauthMocks.oauthProviders.mockResolvedValue({
      enabledProviders: ['oidc'],
      providers: [],
      groups: { international: [], china: [], enterprise: [{ id: 'oidc', name: '企业 SSO' }] },
    })
    oauthMocks.oidcUrl.mockRejectedValue(new Error('boom'))
    const setHref = stubLocation()

    const wrapper = mountView()
    await flushPromises()

    const sso = wrapper.findAll('button').find((b) => b.text() === '企业 SSO')
    await sso!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('企业 SSO 登录失败')
    expect(setHref).not.toHaveBeenCalled()
  })
})

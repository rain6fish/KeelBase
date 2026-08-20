import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const loginMock = vi.fn()
const replaceMock = vi.fn()

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    login: loginMock,
    isAdmin: false,
    errorMessage: '',
    status: 'idle',
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useRoute: () => ({ query: {} }),
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
})

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
})

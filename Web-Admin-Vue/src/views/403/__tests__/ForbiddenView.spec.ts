import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

import ElementPlus from 'element-plus'
import ForbiddenView from '../ForbiddenView.vue'

const pushMock = vi.fn()

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(ForbiddenView, {
    global: {
      plugins: [i18n, ElementPlus],
      mocks: { $router: { push: pushMock } },
      stubs: { AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ForbiddenView', () => {
  it('渲染无权访问文案与返回按钮', () => {
    const wrapper = mountView()

    expect(wrapper.text()).toContain('无权限访问')
    expect(wrapper.text()).toContain('返回')
  })

  it('点击返回 → 跳转 /login', async () => {
    const wrapper = mountView()

    await wrapper.find('button').trigger('click')

    expect(pushMock).toHaveBeenCalledWith('/login')
  })
})

// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { meMock, unreadCountMock, pushMock } = vi.hoisted(() => ({
  meMock: vi.fn(),
  unreadCountMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('@/api/auth', () => ({
  authApi: { me: meMock },
}))
vi.mock('@/api/workbench', () => ({
  workbenchApi: { unreadCount: unreadCountMock },
}))
vi.mock('@/api/admin', () => ({
  adminApi: { appVersion: vi.fn().mockResolvedValue({ latestVersion: '1.0.4' }) },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import WorkbenchHomeView from '../WorkbenchHomeView.vue'

// StatCard stub：渲染 label + value，便于断言用户信息展示
const StatCardStub = defineComponent({
  name: 'StatCard',
  props: ['label', 'value', 'icon', 'color'],
  template: '<div class="stat-stub"><span class="stat-label">{{ label }}</span><span class="stat-value">{{ value }}</span></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(WorkbenchHomeView, {
    global: {
      plugins: [i18n, ElementPlus, createPinia()],
      stubs: {
        PageHeader: true,
        StatCard: StatCardStub,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WorkbenchHomeView', () => {
  it('挂载 → 调用 authApi.me() + workbenchApi.unreadCount() 并渲染用户信息', async () => {
    meMock.mockResolvedValue({ id: 1, username: 'alex', nickname: 'Alex', email: 'alex@example.com', role: 'user' })
    unreadCountMock.mockResolvedValue({ count: 3 })

    const wrapper = mountView()
    await flushPromises()

    expect(meMock).toHaveBeenCalledTimes(1)
    expect(unreadCountMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('alex')
    expect(wrapper.text()).toContain('Alex')
    expect(wrapper.text()).toContain('alex@example.com')
  })

  it('me 失败 → 静默降级（页面正常渲染，未读数照常加载）', async () => {
    meMock.mockRejectedValue(new Error('unauth'))
    unreadCountMock.mockResolvedValue({ count: 1 })

    const wrapper = mountView()
    await flushPromises()

    expect(unreadCountMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('用户名') // 卡片正常渲染，用户名为占位 '-'
  })

  it('未读数失败 → 静默（不抛错）', async () => {
    meMock.mockResolvedValue({ id: 1, username: 'alex', nickname: '', email: '', role: 'user' })
    unreadCountMock.mockRejectedValue(new Error('boom'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('alex')
  })

  it('快捷卡片点击跳转（@click 事件绑定，回归：:on-click 不生效）', async () => {
    meMock.mockResolvedValue({ id: 1, username: 'alex', nickname: 'A', email: 'a@a.com', role: 'user' })
    unreadCountMock.mockResolvedValue({ count: 0 })

    const wrapper = mountView()
    await flushPromises()

    const cards = wrapper.findAll('.shortcut-card')
    expect(cards.length).toBe(6)
    for (const c of cards) await c.trigger('click')
    // 6 张卡：5 张 to 走 router.push，1 张 href（移动预览）走 window.open
    expect(pushMock).toHaveBeenCalledTimes(5)
    const paths = pushMock.mock.calls.map((c: unknown[]) => c[0])
    expect(paths).toEqual(['/workbench/events', '/workbench/todos', '/workbench/notifications', '/workbench/ai-trace', '/workbench/crm-dashboard'])
  })
})

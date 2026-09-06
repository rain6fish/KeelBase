// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { detailMock, useRouteMock, backMock } = vi.hoisted(() => ({
  detailMock: vi.fn(),
  useRouteMock: vi.fn(),
  backMock: vi.fn(),
}))

vi.mock('@/api/users', () => ({
  usersApi: { detail: detailMock },
}))
vi.mock('vue-router', () => ({
  useRoute: () => useRouteMock(),
  useRouter: () => ({ back: backMock }),
}))

import ElementPlus from 'element-plus'
import UserDetailView from '../UserDetailView.vue'

// PageHeader stub：渲染 title/subtitle + 透传默认槽（头部返回按钮可驱动）
const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: ['title', 'subtitle'],
  template: '<div class="ph-stub"><div class="ph-title">{{ title }}</div><div v-if="subtitle" class="ph-subtitle">{{ subtitle }}</div><slot /></div>',
})

const detailFull = {
  id: 1,
  username: 'alex',
  email: 'a***@corp.com',
  role: 'admin',
  nickname: 'Alex',
  createdAt: '2026-01-02T00:00:00Z',
  sessions: [{ id: 11, deviceName: 'Chrome / Windows', ip: '10.0.0.5', lastActiveAt: '2026-09-01T00:00:00Z', createdAt: '2026-08-01T00:00:00Z' }],
  notifications: [{ id: 21, title: '系统维护通知', body: '周日晚停机升级', type: 'system', isRead: true, createdAt: '2026-09-02T00:00:00Z' }],
  counts: { events: 5, operationAuditLogs: 2, aiAuditLogs: 3, totalTokens: 1200 },
}

function mountView() {
  useRouteMock.mockReturnValue({ params: { id: '1' }, query: {} })
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(UserDetailView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UserDetailView（管理台用户详情）', () => {
  it('挂载 → 初始 loading，加载后渲染用户/会话/通知/统计', async () => {
    detailMock.mockResolvedValue(detailFull)

    const wrapper = mountView()
    expect(wrapper.text()).toContain('加载中...')

    await flushPromises()

    expect(detailMock).toHaveBeenCalledTimes(1)
    expect(detailMock).toHaveBeenCalledWith(1)
    expect(wrapper.text()).not.toContain('加载中...')
    expect(wrapper.text()).toContain('用户管理 #1')
    expect(wrapper.text()).toContain('alex') // 用户名（subtitle + 信息卡）
    expect(wrapper.text()).toContain('a***@corp.com') // 服务端脱敏 email
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.text()).toContain('Chrome / Windows') // 会话设备
    expect(wrapper.text()).toContain('10.0.0.5')
    expect(wrapper.text()).toContain('系统维护通知')
    expect(wrapper.text()).toContain('周日晚停机升级')
    expect(wrapper.text()).toContain('1200') // 总 Token 统计值
  })

  it('无会话/无通知 → 渲染占位文案与空统计占位', async () => {
    detailMock.mockResolvedValue({
      ...detailFull,
      sessions: [],
      notifications: [],
      counts: { events: 0, operationAuditLogs: 0, aiAuditLogs: 0, totalTokens: 0 },
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无在线会话')
    expect(wrapper.text()).toContain('暂无通知')
    expect(wrapper.text()).toContain('用户管理 #1')
  })

  it('拉取失败 → 静默降级（loading 清除、无详情、不抛错）', async () => {
    detailMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('加载中...')
    expect(wrapper.text()).toContain('用户管理 #1')
  })

  it('头部返回按钮 → router.back()', async () => {
    detailMock.mockResolvedValue(detailFull)

    const wrapper = mountView()
    await flushPromises()

    const backBtn = wrapper.findAll('button').find((b) => b.text().includes('返回'))
    expect(backBtn).toBeTruthy()
    await backBtn!.trigger('click')
    expect(backMock).toHaveBeenCalledTimes(1)
  })
})

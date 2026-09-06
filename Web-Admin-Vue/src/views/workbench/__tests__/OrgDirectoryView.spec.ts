// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { orgMock, treeMock, membersMock } = vi.hoisted(() => ({
  orgMock: vi.fn(),
  treeMock: vi.fn(),
  membersMock: vi.fn(),
}))

vi.mock('@/api/org', () => ({
  orgApi: { getMyOrg: orgMock, getMyTree: treeMock, listMyMembers: membersMock },
}))

import ElementPlus from 'element-plus'
import OrgDirectoryView from '../OrgDirectoryView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(OrgDirectoryView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        teleport: true,
        AppIcon: true,
        PageHeader: true,
        // 组织部门树为只读展示子组件，非本页断言目标 → 占位
        OrgDeptTree: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  orgMock.mockResolvedValue(null)
  treeMock.mockResolvedValue([])
  membersMock.mockResolvedValue([])
})

const org = { org: { id: 1, name: '释鱼科技' }, role: 'owner', deptId: null, deptPath: [] }

describe('OrgDirectoryView（工作台·组织通讯录）', () => {
  it('挂载 → 调用三个 org API 并渲染组织名与成员', async () => {
    orgMock.mockResolvedValue(org)
    membersMock.mockResolvedValue([{ id: 1, nickname: 'Alex', role: 'owner', deptName: '研发部' }])

    const wrapper = mountView()
    await flushPromises()

    expect(orgMock).toHaveBeenCalledTimes(1)
    expect(treeMock).toHaveBeenCalledTimes(1)
    expect(membersMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('释鱼科技')
    expect(wrapper.text()).toContain('Alex')
    expect(wrapper.text()).toContain('研发部')
  })

  it('未加入组织（getMyOrg → null）→ 渲染空态提示，不抛错', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(orgMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('您尚未加入任何组织')
    expect(wrapper.exists()).toBe(true)
  })

  it('已加入组织但部门/成员为空 → 渲染「暂无部门」「暂无成员」，不抛错', async () => {
    orgMock.mockResolvedValue(org)

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('释鱼科技')
    expect(wrapper.text()).toContain('暂无成员')
  })
})

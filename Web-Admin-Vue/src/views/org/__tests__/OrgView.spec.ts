import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { listOrgsMock, listDeptsMock, listMembersMock, listInvitesMock, errorMock, successMock } = vi.hoisted(() => ({
  listOrgsMock: vi.fn(),
  listDeptsMock: vi.fn(),
  listMembersMock: vi.fn(),
  listInvitesMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/org', () => ({
  orgApi: {
    listOrganizations: listOrgsMock,
    listDepartments: listDeptsMock,
    listMembers: listMembersMock,
    listInvites: listInvitesMock,
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    removeOrganization: vi.fn(),
    createDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    removeDepartment: vi.fn(),
    addMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    createInvite: vi.fn(),
    removeInvite: vi.fn(),
  },
}))
vi.mock('@/api/users', () => ({
  usersApi: { list: vi.fn() },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import OrgView from '../OrgView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(OrgView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: true,
        AppPagination: true,
        DebouncedSearch: true,
        FormDialog: true,
        ConfirmDialog: true,
        OrgDeptTree: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OrgView', () => {
  it('挂载 → 加载组织列表并选中第一个，联动加载部门/成员/邀请', async () => {
    listOrgsMock.mockResolvedValue({ items: [{ id: 5, name: '总部', description: '' }], total: 1 })
    listDeptsMock.mockResolvedValue([])
    listMembersMock.mockResolvedValue({ items: [], total: 0 })
    listInvitesMock.mockResolvedValue([])

    mountView()
    await flushPromises()

    expect(listOrgsMock).toHaveBeenCalledWith(1, 100)
    expect(listDeptsMock).toHaveBeenCalledWith(5)
    expect(listMembersMock).toHaveBeenCalledWith(5, 1, 20, undefined, undefined)
    expect(listInvitesMock).toHaveBeenCalledWith(5)
  })

  it('无组织 → 仅加载组织列表，不触发联动', async () => {
    listOrgsMock.mockResolvedValue({ items: [], total: 0 })

    mountView()
    await flushPromises()

    expect(listOrgsMock).toHaveBeenCalledTimes(1)
    expect(listDeptsMock).not.toHaveBeenCalled()
    expect(listMembersMock).not.toHaveBeenCalled()
    expect(listInvitesMock).not.toHaveBeenCalled()
  })

  it('成员加载失败 → snackbar.error 提示', async () => {
    listOrgsMock.mockResolvedValue({ items: [{ id: 5, name: '总部', description: '' }], total: 1 })
    listDeptsMock.mockResolvedValue([])
    listMembersMock.mockRejectedValue(new Error('org down'))
    listInvitesMock.mockResolvedValue([])

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('加载失败')
  })
})

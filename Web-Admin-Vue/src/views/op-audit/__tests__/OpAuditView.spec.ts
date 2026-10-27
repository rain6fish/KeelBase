// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { opLogsMock, errorMock, successMock, csvMock } = vi.hoisted(() => ({
  opLogsMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
  csvMock: vi.fn(),
}))

vi.mock('@/api/audit', () => ({
  auditApi: { opLogs: opLogsMock, logs: vi.fn(), stats: vi.fn() },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))
vi.mock('@/utils/csv', () => ({ downloadCsv: csvMock }))

import ElementPlus from 'element-plus'
import OpAuditView from '../OpAuditView.vue'

// PageHeader stub：渲染默认插槽（导出按钮在插槽内）
const PageHeaderStub = { name: 'PageHeader', props: ['title', 'subtitle'], template: '<div><slot /></div>' }

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(OpAuditView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: PageHeaderStub, AppTable: true, AppPagination: true, RangeFilter: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OpAuditView', () => {
  it('挂载 → 调用 auditApi.opLogs(1, 20, undefined, undefined)', async () => {
    opLogsMock.mockResolvedValue({ items: [], total: 0 })

    mountView()
    await flushPromises()

    expect(opLogsMock).toHaveBeenCalledWith(1, 20, undefined, undefined)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    opLogsMock.mockRejectedValue(new Error('审计服务异常'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('审计服务异常')
  })

  it('按用户 ID 过滤 → 携带 userId 重新加载', async () => {
    opLogsMock.mockResolvedValue({ items: [], total: 0 })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('input[type="number"]').setValue('5')
    const filterBtn = wrapper.findAll('button').find((b) => b.text().includes('过滤'))
    expect(filterBtn).toBeTruthy()
    await filterBtn!.trigger('click')
    await flushPromises()

    expect(opLogsMock).toHaveBeenLastCalledWith(1, 20, '5', undefined)
  })

  it('导出 → downloadCsv + success 提示', async () => {
    opLogsMock.mockResolvedValue({
      items: [
        {
          id: 1,
          userId: 9,
          action: 'users.update',
          method: 'PUT',
          path: '/api/v1/users/1',
          featureKey: 'users.update',
          featureFallback: 'Update User',
          statusCode: 200,
          createdAt: '2026-08-20T10:00:00Z',
          username: 'alex',
        },
      ],
      total: 1,
    })

    const wrapper = mountView()
    await flushPromises()

    const exportBtn = wrapper.findAll('button').find((b) => b.text().includes('导出'))
    expect(exportBtn).toBeTruthy()
    await exportBtn!.trigger('click')
    await flushPromises()

    expect(csvMock).toHaveBeenCalledWith('op-audit', expect.any(Array), expect.any(Array))
    expect(successMock).toHaveBeenCalledWith('已导出')
  })

  // G-1 / the "why was it allowed" question: the operation-audit row has always carried the
  // authorization snapshot, but the view neither declared nor showed it, so this surface could not
  // answer that question.
  //
  // G-1 / P0-20 六问里的「为什么允许」：操作审计行一直带着授权依据快照，但视图此前没有声明它、也没有
  // 显示它 —— 这一面就答不出那一问。
  describe('G-1 授权依据（为什么允许）', () => {
    // Only a rendered action slot gives us the expand arrow to click.
    // 只有把 action 列插槽真正渲染出来，才点得到展开箭头。
    const AppTableStub = {
      name: 'AppTable',
      props: ['headers', 'items'],
      template:
        '<div class="app-table-stub"><template v-for="item in items" :key="item.id"><slot name="item.actions" :item="item" /></template></div>',
    }

    function mountExpandable() {
      const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
      return mount(OpAuditView, {
        global: {
          plugins: [i18n, ElementPlus],
          stubs: {
            PageHeader: PageHeaderStub,
            AppTable: AppTableStub,
            AppPagination: true,
            RangeFilter: true,
            AppIcon: true,
          },
        },
      })
    }

    it('展开一行 ⇒ 决策 + 角色 + 依据，且依据翻成人话（不把标识符甩给人）', async () => {
      opLogsMock.mockResolvedValue({
        items: [
          {
            id: 1,
            userId: 9,
            action: 'events.create',
            method: 'POST',
            path: '/api/v1/events',
            businessEvent: 'EventCreated',
            statusCode: 201,
            createdAt: '2026-08-20T10:00:00Z',
            username: 'alex',
            authorization: JSON.stringify({
              allowed: true,
              role: 'user',
              basis: 'casl:own-scope(handler-enforced)',
              feature: 'events.create',
              statusCode: 201,
            }),
          },
        ],
        total: 1,
      })

      const wrapper = mountExpandable()
      await flushPromises()
      await wrapper.find('.app-table-stub button').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('授权依据')
      expect(wrapper.text()).toContain('允许')
      expect(wrapper.text()).toContain('角色=user')
      expect(wrapper.text()).toContain('本人数据范围')
      expect(wrapper.text()).not.toContain('casl:own-scope')
      wrapper.unmount()
    })

    it('快照解析不了 ⇒ 原样给出，不吞掉', async () => {
      opLogsMock.mockResolvedValue({
        items: [
          {
            id: 2,
            action: 'events.create',
            method: 'POST',
            path: '/api/v1/events',
            statusCode: 201,
            createdAt: '2026-08-20T10:00:00Z',
            authorization: 'not-json',
          },
        ],
        total: 1,
      })

      const wrapper = mountExpandable()
      await flushPromises()
      await wrapper.find('.app-table-stub button').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('not-json')
      wrapper.unmount()
    })
  })
})

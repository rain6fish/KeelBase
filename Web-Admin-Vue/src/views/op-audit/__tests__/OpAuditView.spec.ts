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
})

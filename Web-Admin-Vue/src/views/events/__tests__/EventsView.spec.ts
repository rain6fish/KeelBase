import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { adminAllMock, adminRemoveMock, errorMock, successMock, csvMock } = vi.hoisted(() => ({
  adminAllMock: vi.fn(),
  adminRemoveMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
  csvMock: vi.fn(),
}))

vi.mock('@/api/events', () => ({
  eventsApi: { adminAll: adminAllMock, adminRemove: adminRemoveMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))
vi.mock('@/utils/csv', () => ({ downloadCsv: csvMock }))

import ElementPlus from 'element-plus'
import EventsView from '../EventsView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(EventsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: true,
        AppPagination: true,
        DebouncedSearch: true,
        RangeFilter: true,
        ConfirmDialog: true,
        StatusChip: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventsView', () => {
  it('挂载 → 调用 eventsApi.adminAll(1, 20) 加载第一页', async () => {
    adminAllMock.mockResolvedValue({ items: [{ id: 1, title: '周会' }], total: 1 })

    mountView()
    await flushPromises()

    expect(adminAllMock).toHaveBeenCalledWith(1, 20, {
      keyword: undefined,
      userId: undefined,
      isCancelled: undefined,
      start: undefined,
    })
  })

  it('加载失败 → snackbar.error 提示', async () => {
    adminAllMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('status=all 时 isCancelled 过滤为 undefined（不传）', async () => {
    adminAllMock.mockResolvedValue({ items: [], total: 0 })

    mountView()
    await flushPromises()

    const call = adminAllMock.mock.calls[0]
    expect(call[2].isCancelled).toBeUndefined()
  })
})

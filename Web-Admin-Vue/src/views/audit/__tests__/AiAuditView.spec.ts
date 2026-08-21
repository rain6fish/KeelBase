import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { logsMock, statsMock, errorMock, successMock, csvMock } = vi.hoisted(() => ({
  logsMock: vi.fn(),
  statsMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
  csvMock: vi.fn(),
}))

vi.mock('@/api/audit', () => ({
  auditApi: { logs: logsMock, stats: statsMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))
vi.mock('@/utils/csv', () => ({ downloadCsv: csvMock }))

import ElementPlus from 'element-plus'
import AiAuditView from '../AiAuditView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiAuditView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: true,
        StatCard: true,
        RangeFilter: true,
        StatusChip: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiAuditView', () => {
  it('挂载 → 并行调用 auditApi.logs + stats', async () => {
    logsMock.mockResolvedValue([{ id: 1, action: 'query_events', createdAt: '2026-08-20' }])
    statsMock.mockResolvedValue({ totalTokens: 100 })

    mountView()
    await flushPromises()

    expect(logsMock).toHaveBeenCalledWith({ userId: undefined, limit: 50, since: undefined })
    expect(statsMock).toHaveBeenCalledWith(undefined)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    logsMock.mockRejectedValue(new Error('审计服务异常'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('审计服务异常')
  })
})

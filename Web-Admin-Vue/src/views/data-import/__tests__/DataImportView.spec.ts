import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { importUsersMock, importEventsMock, importTodosMock, errorMock, successMock, csvMock } = vi.hoisted(() => ({
  importUsersMock: vi.fn(),
  importEventsMock: vi.fn(),
  importTodosMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
  csvMock: vi.fn(),
}))

vi.mock('@/api/import', () => ({
  importApi: {
    importUsers: importUsersMock,
    importEvents: importEventsMock,
    importTodos: importTodosMock,
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))
vi.mock('@/utils/csv', () => ({ downloadCsv: csvMock }))

import ElementPlus from 'element-plus'
import DataImportView from '../DataImportView.vue'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(DataImportView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { PageHeader: true, StatCard: true, AppIcon: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DataImportView', () => {
  it('挂载 → 不触发任何导入 API', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(importUsersMock).not.toHaveBeenCalled()
    expect(importEventsMock).not.toHaveBeenCalled()
    expect(importTodosMock).not.toHaveBeenCalled()
    expect(wrapper.exists()).toBe(true)
  })

  it('选择用户 CSV → 调用 importApi.importUsers(file) + success + 渲染结果', async () => {
    importUsersMock.mockResolvedValue({ type: 'user', total: 3, success: 2, failed: 1, errors: [{ row: 3, reason: '邮箱格式错误' }] })

    const wrapper = mountView()
    await flushPromises()

    const input = wrapper.findAll('input[type="file"]')[0] // 第一个 = 用户导入
    const file = new File(['username,email'], 'users.csv', { type: 'text/csv' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(importUsersMock).toHaveBeenCalledWith(file)
    expect(successMock).toHaveBeenCalledWith('导入完成')
    expect(wrapper.text()).toContain('导入结果')
  })

  it('导入失败 → snackbar.error 提示', async () => {
    importUsersMock.mockRejectedValue(new Error('CSV 解析失败'))

    const wrapper = mountView()
    await flushPromises()

    const input = wrapper.findAll('input[type="file"]')[0]
    const file = new File(['bad'], 'users.csv', { type: 'text/csv' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('CSV 解析失败')
  })

  it('下载用户模板 → downloadCsv 生成模板 CSV', async () => {
    const wrapper = mountView()
    await flushPromises()

    const dlBtn = wrapper.findAll('button').find((b) => b.text().includes('下载模板'))
    expect(dlBtn).toBeTruthy()
    await dlBtn!.trigger('click')
    await flushPromises()

    expect(csvMock).toHaveBeenCalledWith('import_users_template', expect.any(Array), expect.any(Array))
  })
})

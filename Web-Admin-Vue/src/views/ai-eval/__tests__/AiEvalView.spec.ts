import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { listCasesMock, reportMock, runMock, seedMock, removeMock, errorMock, successMock } = vi.hoisted(() => ({
  listCasesMock: vi.fn(),
  reportMock: vi.fn(),
  runMock: vi.fn(),
  seedMock: vi.fn(),
  removeMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/aiEval', () => ({
  aiEvalApi: {
    listCases: listCasesMock,
    report: reportMock,
    run: runMock,
    seed: seedMock,
    removeCase: removeMock,
    createCase: vi.fn(),
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import AiEvalView from '../AiEvalView.vue'

// PageHeader stub：渲染默认插槽（跑评测/补齐用例按钮在插槽内）
const PageHeaderStub = { name: 'PageHeader', props: ['title', 'subtitle'], template: '<div><slot /></div>' }

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiEvalView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: PageHeaderStub,
        AppTable: true,
        StatusChip: true,
        FormDialog: true,
        ConfirmDialog: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiEvalView', () => {
  it('挂载 → 并行调用 listCases() + report()', async () => {
    listCasesMock.mockResolvedValue([])
    reportMock.mockResolvedValue(null)

    mountView()
    await flushPromises()

    expect(listCasesMock).toHaveBeenCalledTimes(1)
    expect(reportMock).toHaveBeenCalledTimes(1)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    listCasesMock.mockRejectedValue(new Error('网络错误'))
    reportMock.mockResolvedValue(null)

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('点击「跑评测」→ 调用 aiEvalApi.run() + success 提示', async () => {
    listCasesMock.mockResolvedValue([])
    reportMock.mockResolvedValue(null)
    runMock.mockResolvedValue({ passed: 1, failed: 0, total: 1, cases: [] })

    const wrapper = mountView()
    await flushPromises()

    const runBtn = wrapper.findAll('button').find((b) => b.text().includes('跑评测'))
    expect(runBtn).toBeTruthy()
    await runBtn!.trigger('click')
    await flushPromises()

    expect(runMock).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalledWith('评测完成')
  })

  it('点击「补齐内置用例」→ 调用 aiEvalApi.seed() + success 提示', async () => {
    listCasesMock.mockResolvedValue([])
    reportMock.mockResolvedValue(null)
    seedMock.mockResolvedValue({ added: 2 })

    const wrapper = mountView()
    await flushPromises()

    const seedBtn = wrapper.findAll('button').find((b) => b.text().includes('补齐内置用例'))
    expect(seedBtn).toBeTruthy()
    await seedBtn!.trigger('click')
    await flushPromises()

    expect(seedMock).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalledWith('已补齐 2 条用例')
  })
})

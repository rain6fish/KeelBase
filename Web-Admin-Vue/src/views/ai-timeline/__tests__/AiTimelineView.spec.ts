import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { logsMock, effectsMock, revokeMock, governanceMock, errorMock, successMock } = vi.hoisted(() => ({
  logsMock: vi.fn(),
  effectsMock: vi.fn(),
  revokeMock: vi.fn(),
  governanceMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/audit', () => ({
  auditApi: { logs: logsMock },
}))
vi.mock('@/api/aiTools', () => ({
  aiToolsApi: { effects: effectsMock, revokeEffect: revokeMock, governanceAction: governanceMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import AiTimelineView from '../AiTimelineView.vue'

const toolCallLog = {
  id: 1,
  userId: 'u1',
  conversationId: 'conv-1234567890123',
  action: 'tool_call',
  detail: 'create_event({"title":"周会"})',
  isError: false,
  createdAt: '2026-08-21T10:00:00Z',
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiTimelineView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        StatusChip: true,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiTimelineView', () => {
  it('挂载 → 并行加载日志 + 副作用（limit 100）', async () => {
    logsMock.mockResolvedValue([toolCallLog])
    effectsMock.mockResolvedValue({ total: 0, page: 1, limit: 100, items: [] })

    mountView()
    await flushPromises()

    expect(logsMock).toHaveBeenCalledWith({ userId: undefined, limit: 100 })
    expect(effectsMock).toHaveBeenCalledWith(undefined, 1, 100)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    logsMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('按用户过滤 → 重新加载带 userId 参数', async () => {
    logsMock.mockResolvedValue([])
    effectsMock.mockResolvedValue({ total: 0, page: 1, limit: 100, items: [] })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('input').setValue('7')
    await wrapper.find('.el-button--primary').trigger('click')
    await flushPromises()

    expect(logsMock).toHaveBeenLastCalledWith({ userId: '7', limit: 100 })
    expect(effectsMock).toHaveBeenLastCalledWith(7, 1, 100)
  })

  it('渲染会话时间线（工具调用 + 副作用 revoke 按钮）', async () => {
    logsMock.mockResolvedValue([toolCallLog])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 100,
      items: [
        { id: 3, toolName: 'create_event', conversationId: 'conv-1234567890123', resultType: 'event', resultId: 50, argsHash: 'h', createdAt: '2026-08-21T10:00:30Z', targetExists: true, targetSoftDeleted: false, targetTitle: '周会' },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('create_event')
    // 副作用带撤销按钮
    const revokeBtn = wrapper.find('.el-button--warning')
    expect(revokeBtn.exists()).toBe(true)

    revokeMock.mockResolvedValue({ revoked: true, effectId: 3 })
    await revokeBtn.trigger('click')
    await flushPromises()

    expect(revokeMock).toHaveBeenCalledWith(3)
    expect(successMock).toHaveBeenCalledWith('已下线')
  })

  it('EB-2：proxy_call 副作用渲染「外部系统」标识', async () => {
    logsMock.mockResolvedValue([])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 100,
      items: [
        { id: 9, toolName: 'ext_create_customer', conversationId: null, resultType: 'proxy_call', resultId: 7, argsHash: 'h', createdAt: '2026-08-25T10:00:00Z', targetExists: true, targetSoftDeleted: false, targetTitle: '外部系统写调用（B 路径）' },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('ext_create_customer')
    expect(wrapper.text()).toContain('外部系统（B 路径）')
  })

  it('治理详情：点副作用「治理详情」→ 调 governanceAction + 抽屉显示 Who/What', async () => {
    logsMock.mockResolvedValue([toolCallLog])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 100,
      items: [
        { id: 3, toolName: 'create_event', conversationId: 'conv-1234567890123', resultType: 'event', resultId: 50, argsHash: 'h', createdAt: '2026-08-21T10:00:30Z', targetExists: true, targetSoftDeleted: false, targetTitle: '周会' },
      ],
    })
    governanceMock.mockResolvedValue({
      effect: { id: 3, userId: 'u1', toolName: 'create_event', argsHash: 'h', conversationId: 'conv-1234567890123', resultType: 'event', resultId: 50, createdAt: '2026-08-21T10:00:30Z' },
      trace: null,
    })

    const wrapper = mountView()
    await flushPromises()

    const infoBtn = wrapper.find('.el-button--info')
    expect(infoBtn.exists()).toBe(true)
    await infoBtn.trigger('click')
    await flushPromises()

    expect(governanceMock).toHaveBeenCalledWith('event', 50)
    expect(wrapper.text()).toContain('u1')
    expect(wrapper.text()).toContain('create_event')
  })
})

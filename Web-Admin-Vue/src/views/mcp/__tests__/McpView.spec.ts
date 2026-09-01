// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { serversMock, registerMock, removeMock, discoverMock, callMock, errorMock, successMock } = vi.hoisted(() => ({
  serversMock: vi.fn(),
  registerMock: vi.fn(),
  removeMock: vi.fn(),
  discoverMock: vi.fn(),
  callMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/mcp', () => ({
  mcpApi: {
    servers: serversMock,
    register: registerMock,
    remove: removeMock,
    discover: discoverMock,
    call: callMock,
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import McpView from '../McpView.vue'

const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialog',
  props: ['modelValue', 'title', 'content'],
  emits: ['confirm', 'update:modelValue'],
  template:
    '<div class="confirm-stub" v-if="modelValue"><button class="confirm-btn" @click="$emit(\'confirm\')">confirm</button></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(McpView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        ConfirmDialog: ConfirmDialogStub,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('McpView', () => {
  it('挂载 → 并行加载 servers + discover(false)', async () => {
    serversMock.mockResolvedValue([{ name: 'github', url: 'https://mcp.example.com' }])
    discoverMock.mockResolvedValue([{ server: 'github', tools: [] }])

    mountView()
    await flushPromises()

    expect(serversMock).toHaveBeenCalledTimes(1)
    expect(discoverMock).toHaveBeenCalledWith(false)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    serversMock.mockRejectedValue(new Error('网络错误'))
    discoverMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('注册 server → 填名称/URL → register(name, url) + success + force 刷新工具', async () => {
    serversMock.mockResolvedValue([])
    discoverMock.mockResolvedValue([])
    registerMock.mockResolvedValue([{ name: 'github', url: 'https://mcp.example.com' }])

    const wrapper = mountView()
    await flushPromises()

    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('github')
    await inputs[1].setValue('https://mcp.example.com')
    await wrapper.find('.el-button--primary').trigger('click')
    await flushPromises()

    expect(registerMock).toHaveBeenCalledWith('github', 'https://mcp.example.com')
    expect(successMock).toHaveBeenCalledWith('注册')
    expect(discoverMock).toHaveBeenLastCalledWith(true)
  })

  it('移除 server → 确认 → remove(name) + success', async () => {
    serversMock.mockResolvedValue([{ name: 'github', url: 'https://mcp.example.com' }])
    discoverMock.mockResolvedValue([{ server: 'github', tools: [] }])
    removeMock.mockResolvedValue([])

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.el-button--danger').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(removeMock).toHaveBeenCalledWith('github')
    expect(successMock).toHaveBeenCalledWith('移除')
  })

  it('调用工具 → 打开对话框填参数 → call(server, tool, args)', async () => {
    serversMock.mockResolvedValue([{ name: 'github', url: 'https://mcp.example.com' }])
    discoverMock.mockResolvedValue([
      { server: 'github', tools: [{ name: 'list_repos', description: '列表仓库', readOnly: true }] },
    ])
    callMock.mockResolvedValue({ executed: true, requiresConfirmation: false, result: { content: [{ type: 'text', text: 'ok' }] } })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.el-button--primary.is-plain').trigger('click')
    await flushPromises()

    const dialog = wrapper.find('.el-dialog')
    expect(dialog.exists()).toBe(true)

    await dialog.find('textarea').setValue('{"owner":"octocat"}')
    await dialog.find('.el-dialog__footer .el-button--primary').trigger('click')
    await flushPromises()

    expect(callMock).toHaveBeenCalledWith('github', 'list_repos', { owner: 'octocat' })
  })

  it('调用参数 JSON 非法 → snackbar.error 且不调用 call', async () => {
    serversMock.mockResolvedValue([{ name: 'github', url: 'https://mcp.example.com' }])
    discoverMock.mockResolvedValue([
      { server: 'github', tools: [{ name: 'list_repos', description: '', readOnly: true }] },
    ])

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.el-button--primary.is-plain').trigger('click')
    await flushPromises()

    const dialog = wrapper.find('.el-dialog')
    await dialog.find('textarea').setValue('{invalid')
    await dialog.find('.el-dialog__footer .el-button--primary').trigger('click')
    await flushPromises()

    expect(callMock).not.toHaveBeenCalled()
    expect(errorMock).toHaveBeenCalledWith('JSON 参数解析失败')
  })
})

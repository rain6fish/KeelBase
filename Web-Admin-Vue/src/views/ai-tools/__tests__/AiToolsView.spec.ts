// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { toolsMock, policyMock, savePolicyMock, effectsMock, revokeMock, errorMock, successMock } = vi.hoisted(() => ({
  toolsMock: vi.fn(),
  policyMock: vi.fn(),
  savePolicyMock: vi.fn(),
  effectsMock: vi.fn(),
  revokeMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/aiTools', () => ({
  aiToolsApi: {
    tools: toolsMock,
    policy: policyMock,
    savePolicy: savePolicyMock,
    effects: effectsMock,
    revokeEffect: revokeMock,
  },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import AiToolsView from '../AiToolsView.vue'

const AppTableStub = defineComponent({
  name: 'AppTable',
  props: ['headers', 'items', 'loading', 'total', 'itemsPerPage'],
  template:
    '<div class="app-table-stub"><template v-for="item in items" :key="item.id"><slot name="item.actions" :item="item" /></template></div>',
})
const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialog',
  props: ['modelValue', 'title', 'content'],
  emits: ['confirm', 'update:modelValue'],
  template:
    '<div class="confirm-stub" v-if="modelValue"><button class="confirm-btn" @click="$emit(\'confirm\')">confirm</button></div>',
})

const tool = {
  name: 'create_event',
  description: '创建事件',
  parameters: [{ name: 'title', type: 'string', required: true }],
  enabled: true,
  requiresConfirmation: true,
  allowedRoles: ['user'],
  riskLevel: 'R3',
  riskStrategy: 'confirmation',
  permissions: null,
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiToolsView, {
    global: {
      plugins: [i18n, ElementPlus],
      stubs: {
        PageHeader: true,
        AppTable: AppTableStub,
        AppPagination: true,
        StatusChip: true,
        ConfirmDialog: ConfirmDialogStub,
        AppIcon: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiToolsView', () => {
  it('挂载 → 加载工具清单 + 副作用（治理策略编辑已收敛至策略中心）', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({ total: 0, page: 1, limit: 20, items: [] })

    mountView()
    await flushPromises()

    expect(toolsMock).toHaveBeenCalledTimes(1)
    expect(policyMock).not.toHaveBeenCalled()
    expect(effectsMock).toHaveBeenCalledWith(undefined, 1, 20)
  })

  it('加载失败 → snackbar.error 提示', async () => {
    toolsMock.mockRejectedValue(new Error('工具服务异常'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('工具服务异常')
  })

  it('撤销副作用确认 → revokeEffect(id) + success + 刷新', async () => {
    toolsMock.mockResolvedValue([tool])
    effectsMock.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 9, toolName: 'create_event', conversationId: null, resultType: 'event', resultId: 100, argsHash: 'h', createdAt: '2026-08-21', targetExists: true, targetSoftDeleted: false, targetTitle: '周会' },
      ],
    })
    revokeMock.mockResolvedValue({ revoked: true, effectId: 9 })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.app-table-stub .el-button--danger').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(revokeMock).toHaveBeenCalledWith(9)
    expect(successMock).toHaveBeenCalledWith('已下线')
    expect(effectsMock).toHaveBeenCalledTimes(2)
  })
})

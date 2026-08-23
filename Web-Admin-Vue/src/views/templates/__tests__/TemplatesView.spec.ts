import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { listMock, importMock, errorMock, successMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  importMock: vi.fn(),
  errorMock: vi.fn(),
  successMock: vi.fn(),
}))

vi.mock('@/api/templates', () => ({
  templatesApi: { list: listMock, importTemplate: importMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => ({ error: errorMock, success: successMock }),
}))

import ElementPlus from 'element-plus'
import TemplatesView from '../TemplatesView.vue'

const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialog',
  props: ['modelValue', 'title', 'content'],
  emits: ['confirm', 'update:modelValue'],
  template:
    '<div class="confirm-stub" v-if="modelValue"><button class="confirm-btn" @click="$emit(\'confirm\')">confirm</button></div>',
})

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(TemplatesView, {
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

describe('TemplatesView', () => {
  it('挂载 → 调用 templatesApi.list() 加载模板', async () => {
    listMock.mockResolvedValue([
      { id: 'tpl-1', name: '入职模板', description: '新人入职', events: [{ title: '欢迎会', startTime: '2026-08-20T10:00:00Z', endTime: '2026-08-20T11:00:00Z' }], todos: [{ title: '开通账号' }] },
    ])

    const wrapper = mountView()
    await flushPromises()

    expect(listMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('入职模板')
  })

  it('加载失败 → snackbar.error 提示', async () => {
    listMock.mockRejectedValue(new Error('网络错误'))

    mountView()
    await flushPromises()

    expect(errorMock).toHaveBeenCalledWith('网络错误')
  })

  it('导入确认 → 调用 templatesApi.importTemplate(id) + success', async () => {
    listMock.mockResolvedValue([
      { id: 'tpl-2', name: '周报模板', description: '', events: [{ title: '周会', startTime: '2026-08-20T10:00:00Z', endTime: '2026-08-20T11:00:00Z' }], todos: [{ title: '写周报' }] },
    ])
    importMock.mockResolvedValue({ template: 'tpl-2', targetUserId: 1, events: 1, todos: 1 })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.el-button--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.confirm-stub').exists()).toBe(true)

    await wrapper.find('.confirm-stub .confirm-btn').trigger('click')
    await flushPromises()

    expect(importMock).toHaveBeenCalledWith('tpl-2')
    expect(successMock).toHaveBeenCalledWith('已导入 1 个事件 / 1 个待办')
  })
})

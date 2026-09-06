// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const { todosMock, createMock, snackMock } = vi.hoisted(() => ({
  todosMock: vi.fn(),
  createMock: vi.fn(),
  snackMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api/workbench', () => ({
  workbenchApi: { todos: todosMock, createTodo: createMock },
}))
vi.mock('@/stores/snackbar', () => ({
  useSnackbarStore: () => snackMock,
}))

import { defineComponent } from 'vue'
import ElementPlus from 'element-plus'
import MyTodosView from '../MyTodosView.vue'

const todo = { id: 1, title: '买牛奶', dueDate: '2026-09-01T00:00:00Z', completed: false }

// PageHeader 渲染标题槽：stub 透传默认槽，让「新增」按钮暴露可驱动
const PageHeaderStub = defineComponent({ template: '<div><slot /></div>' })

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(MyTodosView, {
    global: {
      plugins: [i18n, ElementPlus],
      // el-dialog 默认 teleport 到 body；stub 使其内联渲染便于驱动表单；AppIcon 为 main.ts 全局注册
      stubs: { teleport: true, AppIcon: true, PageHeader: PageHeaderStub },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  todosMock.mockResolvedValue([])
  createMock.mockResolvedValue({ id: 2 })
})

describe('MyTodosView（工作台待办）', () => {
  it('挂载 → 加载待办列表并渲染行', async () => {
    todosMock.mockResolvedValue([todo])

    const wrapper = mountView()
    await flushPromises()

    expect(todosMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('买牛奶')
  })

  it('加载失败 → snackbar.error，不抛错', async () => {
    todosMock.mockRejectedValue(new Error('网络错误'))

    const wrapper = mountView()
    await flushPromises()

    expect(snackMock.error).toHaveBeenCalledWith('网络错误')
    expect(wrapper.exists()).toBe(true)
  })

  it('新建：空标题校验 warning；填标题保存 → createTodo + success + 重拉', async () => {
    const wrapper = mountView()
    await flushPromises()

    // 打开新增弹窗（按钮含「新增」文案）
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('新建'))
    expect(addBtn).toBeTruthy()
    await addBtn!.trigger('click')
    await flushPromises()

    // 空标题直接保存 → 校验 warning，不调用 create
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存'))
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(createMock).not.toHaveBeenCalled()
    expect(snackMock.warning).toHaveBeenCalled()

    // 填标题（弹窗内第一个文本框）→ 保存成功
    const titleInput = wrapper.find('.el-dialog input[type="text"]')
    await titleInput.setValue('写周报')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ title: '写周报' }))
    expect(snackMock.success).toHaveBeenCalled()
    expect(todosMock.mock.calls.length).toBeGreaterThanOrEqual(2) // 保存后重拉
  })
})

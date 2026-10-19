// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

const mocks = vi.hoisted(() => ({
  customers: vi.fn(),
  projects: vi.fn(),
}))

vi.mock('@/api/crm', () => ({ crmApi: { customers: mocks.customers } }))
vi.mock('@/api/pm', () => ({ pmApi: { projects: mocks.projects } }))

import CopilotQuickStart from '../CopilotQuickStart.vue'

const page = <T>(items: T[]) => ({ items, total: items.length, page: 1, limit: 100, totalPages: 1 })

function mountQuickStart(locale: 'zh' | 'en' = 'zh') {
  const i18n = createI18n({ legacy: false, locale, messages: { zh, en } })
  return mount(CopilotQuickStart, { global: { plugins: [ElementPlus, i18n] } })
}

async function selectValue(wrapper: ReturnType<typeof mount>, value: number) {
  const select = wrapper.findComponent({ name: 'ElSelect' })
  select.vm.$emit('update:modelValue', value)
  await nextTick()
}

describe('CopilotQuickStart · guided Copilot input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.customers.mockResolvedValue(page([{ id: 5, name: '辰光建材' }]))
    mocks.projects.mockResolvedValue(page([{ id: 9, name: '电商重构' }]))
  })

  it('shows the two guided actions and loads real customers only when opened', async () => {
    const wrapper = mountQuickStart()
    expect(wrapper.find('[data-testid="quick-action-risk"]').text()).toContain('查一个风险')
    expect(wrapper.find('[data-testid="quick-action-task"]').text()).toContain('建一条任务')
    expect(mocks.customers).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="quick-action-risk"]').trigger('click')
    await flushPromises()

    expect(mocks.customers).toHaveBeenCalledWith({ limit: 100 })
    expect(wrapper.find('[data-testid="quick-risk-panel"]').exists()).toBe(true)
  })

  it('emits the selected customer for a real risk call', async () => {
    const wrapper = mountQuickStart()
    await wrapper.find('[data-testid="quick-action-risk"]').trigger('click')
    await flushPromises()

    await selectValue(wrapper, 5)
    await wrapper.find('[data-testid="quick-risk-run"]').trigger('click')

    expect(wrapper.emitted('analyze-risk')?.[0]).toEqual([{ kind: 'customer', id: 5, name: '辰光建材' }])
  })

  it('switches to projects and emits a project risk request', async () => {
    const wrapper = mountQuickStart()
    await wrapper.find('[data-testid="quick-action-risk"]').trigger('click')
    await flushPromises()

    const group = wrapper.findComponent({ name: 'ElRadioGroup' })
    group.vm.$emit('update:modelValue', 'project')
    await flushPromises()

    expect(mocks.projects).toHaveBeenCalledWith({ limit: 100 })
    await selectValue(wrapper, 9)
    await wrapper.find('[data-testid="quick-risk-run"]').trigger('click')

    expect(wrapper.emitted('analyze-risk')?.[0]).toEqual([{ kind: 'project', id: 9, name: '电商重构' }])
  })

  it('shows a review step before emitting the task request', async () => {
    const wrapper = mountQuickStart()
    await wrapper.find('[data-testid="quick-action-task"]').trigger('click')
    await flushPromises()

    await selectValue(wrapper, 5)
    await wrapper.findComponent({ name: 'ElInput' }).find('input').setValue('  回访逾期客户  ')
    await wrapper.find('[data-testid="quick-task-create"]').trigger('click')

    // Nothing is emitted until the review step is confirmed.
    // 复核步骤确认前不发出任何请求。
    expect(wrapper.find('[data-testid="quick-task-review"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quick-task-review-line"]').text()).toContain('回访逾期客户')
    expect(wrapper.find('[data-testid="quick-task-review-line"]').text()).toContain('辰光建材')
    expect(wrapper.emitted('create-task')).toBeUndefined()

    await wrapper.find('[data-testid="quick-task-confirm"]').trigger('click')

    expect(wrapper.emitted('create-task')?.[0]).toEqual([
      { customerId: 5, customerName: '辰光建材', title: '回访逾期客户', dueDate: undefined },
    ])
  })

  it('keeps the guidance visible but reports an honest empty list', async () => {
    mocks.customers.mockResolvedValue(page([]))
    const wrapper = mountQuickStart()
    await wrapper.find('[data-testid="quick-action-risk"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="quick-empty"]').text()).toContain('暂无客户可分析')
    expect(wrapper.find('[data-testid="quick-risk-run"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('analyze-risk')).toBeUndefined()
  })

  it('reports a load failure instead of inventing data', async () => {
    mocks.customers.mockRejectedValue(new Error('403'))
    const wrapper = mountQuickStart()
    await wrapper.find('[data-testid="quick-action-risk"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('加载列表失败')
    expect(wrapper.find('[data-testid="quick-risk-run"]').attributes('disabled')).toBeDefined()
  })

  it('renders the guidance in English when the console is English', async () => {
    const wrapper = mountQuickStart('en')
    expect(wrapper.find('[data-testid="quick-action-risk"]').text()).toContain('Check a risk')
    expect(wrapper.find('[data-testid="quick-action-task"]').text()).toContain('Create a task')
    expect(wrapper.text()).toContain('No tool names needed')
  })
})

// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import zh from '@/i18n/zh'
import en from '@/i18n/en'

import ElementPlus from 'element-plus'
import AiConfirmationCard from '../AiConfirmationCard.vue'

const confirmation = {
  token: 'tok-1',
  toolName: 'create_followup_task',
  summary: '给上海 XX 公司创建跟进任务',
  arguments: { customerId: 7, title: '跟进高风险客户' },
  authorization: { riskLevel: 'R3', checks: [{ name: 'ownership', ok: true, note: '张三拥有该客户' }] },
}

function mountCard(overrides?: Record<string, unknown>) {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(AiConfirmationCard, {
    global: { plugins: [ElementPlus, i18n] },
    props: { confirmation: { ...confirmation, ...overrides } },
  })
}

describe('AiConfirmationCard（D1 闭环写操作确认卡）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('渲染工具摘要、风险级标签与参数', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('需确认的操作')
    expect(wrapper.text()).toContain('给上海 XX 公司创建跟进任务')
    expect(wrapper.text()).toContain('需确认') // R3 → riskConfirm
    expect(wrapper.text()).toContain('customerId')
  })

  it('批准 → emit approved(trustTool=false)', async () => {
    const wrapper = mountCard()
    const approve = wrapper.findAll('button').find((b) => b.text().includes('批准'))!
    await approve.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('approved')?.[0]).toEqual([false])
  })

  it('勾选「本会话信任」后批准 → emit approved(trustTool=true)', async () => {
    const wrapper = mountCard()
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(true)
    const approve = wrapper.findAll('button').find((b) => b.text().includes('批准'))!
    await approve.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('approved')?.[0]).toEqual([true])
  })

  it('拒绝 → emit rejected', async () => {
    const wrapper = mountCard()
    const reject = wrapper.findAll('button').find((b) => b.text().includes('拒绝'))!
    await reject.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('rejected')).toHaveLength(1)
  })

  it('无 checks 时不渲染技术详情区', () => {
    const wrapper = mountCard({ authorization: { riskLevel: 'R3' } })
    expect(wrapper.text()).not.toContain('查看技术详情')
  })

  // KB-5 run-level approval：整批确认卡
  it('run 卡：渲染逐条动作 + 数量，隐藏信任勾选（HS-6 不被批内模糊）', () => {
    const wrapper = mountCard({
      toolName: undefined,
      summary: undefined,
      mode: 'run',
      run: {
        runId: 'run-1',
        riskLevel: 'R3',
        items: [
          { toolName: 'create_event', summary: '创建事件：评审', riskLevel: 'R3' },
          { toolName: 'create_todo', summary: '创建待办：待办A', riskLevel: 'R3' },
        ],
      },
    })
    expect(wrapper.text()).toContain('创建事件：评审')
    expect(wrapper.text()).toContain('创建待办：待办A')
    // i18n key 未加 → fallback 内联文案（随并发 i18n 合并后提为正式 key）
    expect(wrapper.text()).toContain('本次将执行 2 个操作')
    // run 卡无信任勾选（per-tool HS-6 语义不被批内多工具模糊）
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('run 卡批准 → emit approved(false)', async () => {
    const wrapper = mountCard({
      toolName: undefined,
      mode: 'run',
      run: { runId: 'run-1', riskLevel: 'R3', items: [{ toolName: 'create_event', summary: '创建事件：评审', riskLevel: 'R3' }] },
    })
    const approve = wrapper.findAll('button').find((b) => b.text().includes('批准'))!
    await approve.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('approved')?.[0]).toEqual([false])
  })
})

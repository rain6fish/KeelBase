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

  // §22.17 ④ 影响预览
  it('impact → 渲染「预计影响：N 个写动作 · 对象类型 × 条数」', () => {
    const wrapper = mountCard({ impact: { actions: 3, targets: [{ resultType: 'crm_task', count: 2 }, { resultType: 'contract', count: 1 }] } })
    expect(wrapper.text()).toContain('预计影响：3 个写动作')
    expect(wrapper.text()).toContain('crm_task ×2')
    expect(wrapper.text()).toContain('contract ×1')
  })

  it('无 impact（后端省略）→ 不渲染影响行', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).not.toContain('预计影响')
  })

  // §22.17 ④ 影响预览 v1.1 撤销口径
  it('revokeClass（单条）→ 渲染撤销口径行，能撤才说能撤', () => {
    const wrapper = mountCard({ revokeClass: 'local_compensate' })
    expect(wrapper.text()).toContain('撤销口径')
    expect(wrapper.text()).toContain('可撤销（本地）')
  })

  it('revokeClass=none → 如实显示「不可撤销」，不称可撤销', () => {
    const wrapper = mountCard({ revokeClass: 'none' })
    expect(wrapper.text()).toContain('不可撤销')
  })

  it('run 混合档 → 按档分组计数，不塌缩成单档', () => {
    const wrapper = mountCard({
      toolName: undefined,
      summary: undefined,
      mode: 'run',
      run: {
        runId: 'run-1',
        riskLevel: 'R3',
        items: [
          { toolName: 'create_event', summary: '创建事件：评审', riskLevel: 'R3', revokeClass: 'local_compensate' },
          { toolName: 'create_todo', summary: '创建待办：待办A', riskLevel: 'R3', revokeClass: 'local_compensate' },
          { toolName: 'proxy_tool_x', summary: '外部结算', riskLevel: 'R3', revokeClass: 'governed_external' },
        ],
      },
    })
    const text = wrapper.text()
    expect(text).toContain('可撤销（本地）')
    expect(text).toContain('×2')
    expect(text).toContain('可撤销（需外部补偿）')
    expect(text).not.toContain('不可撤销')
  })

  it('无 revokeClass（老载荷）→ 不渲染撤销口径行，不补默认"可撤销"', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).not.toContain('撤销口径')
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

// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ElementPlus from 'element-plus'
import zh from '@/i18n/zh'
import en from '@/i18n/en'
import TraceFlowGraph from '../TraceFlowGraph.vue'
import type { TraceStep } from '@/types/workbench'

function step(id: string, type: TraceStep['type'], overrides: Partial<TraceStep> = {}): TraceStep {
  return { id, type, time: '2026-10-18T00:00:00Z', ...overrides }
}

const steps: TraceStep[] = [
  step('msg-0', 'input', { content: '查一下客户' }),
  step('tool-1', 'tool_call', { toolName: 'query_customers', args: '{}', success: true, agentId: 'research-agent' }),
  step('conf-2', 'confirmation', { toolName: 'create_followup_task', args: '{}', outcome: 'approve' }),
  step('effect-3', 'effect', {
    toolName: 'create_followup_task',
    effect: { effectId: 1, resultType: 'crm_task', resultId: 42, targetTitle: '跟进', revocable: true },
  }),
]

function mountGraph(
  input: TraceStep[] = steps,
  selectedId: string | null = null,
  effectStatuses: Record<number, string> = {},
) {
  const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh, en } })
  return mount(TraceFlowGraph, {
    global: { plugins: [i18n, ElementPlus], stubs: { AppIcon: true } },
    props: { steps: input, selectedId, effectStatuses },
  })
}

describe('TraceFlowGraph（Agent 决策轨迹图）', () => {
  it('节点数 = 服务端步骤数，边数 = 相邻数，并显示节点/边读数', () => {
    const wrapper = mountGraph()

    expect(wrapper.findAll('.trace-node')).toHaveLength(4)
    expect(wrapper.findAll('.graph-edge')).toHaveLength(3)
    expect(wrapper.text()).toContain('4 个节点 · 3 条边')
    expect(wrapper.find('.trace-node[data-step-type="confirmation"]').exists()).toBe(true)
    expect(wrapper.find('.trace-node[data-step-type="effect"]').exists()).toBe(true)
  })

  it('缺 id 的步骤不画节点、不补边（守卫；拿掉即红）', () => {
    const wrapper = mountGraph([
      step('a', 'input'),
      step('', 'tool_call'),
      step('c', 'effect'),
    ])

    expect(wrapper.findAll('.trace-node')).toHaveLength(2)
    // a 与 c 不相邻 → 0 条边
    expect(wrapper.findAll('.graph-edge')).toHaveLength(0)
    expect(wrapper.text()).toContain('2 个节点 · 0 条边')
  })

  it('点击节点 → 抛出服务端步骤', async () => {
    const wrapper = mountGraph()
    await wrapper.find('.trace-node[data-step-id="tool-1"]').trigger('click')

    const events = wrapper.emitted('select')
    expect(events).toBeTruthy()
    expect((events![0][0] as TraceStep).id).toBe('tool-1')
    expect((events![0][0] as TraceStep).agentId).toBe('research-agent')
  })

  it('可撤副作用节点显示撤销按钮；点击只抛 revoke，不触发 select', async () => {
    const wrapper = mountGraph()
    const revokeBtn = wrapper.find('.trace-node[data-step-id="effect-3"] .node-revoke')
    expect(revokeBtn.exists()).toBe(true)

    await revokeBtn.trigger('click')

    expect(wrapper.emitted('select')).toBeFalsy()
    const events = wrapper.emitted('revoke')
    expect(events).toBeTruthy()
    expect((events![0][0] as { effectId: number }).effectId).toBe(1)
  })

  it('副作用状态只按服务端给出标注；缺状态不猜（守卫；拿掉即红）', () => {
    const withStatus = mountGraph(steps, null, { 1: 'revoked' })
    expect(withStatus.find('.trace-node[data-step-id="effect-3"]').text()).toContain('已撤销')

    const withoutStatus = mountGraph(steps)
    const text = withoutStatus.find('.trace-node[data-step-id="effect-3"]').text()
    expect(text).not.toContain('已撤销')
    expect(text).not.toContain('已执行')
  })

  it('服务端不可撤 → 不显示撤销按钮', () => {
    const wrapper = mountGraph([
      step('effect-1', 'effect', {
        toolName: 'create_followup_task',
        effect: { effectId: 2, resultType: 'crm_task', resultId: 43, revocable: false },
      }),
    ])
    expect(wrapper.find('.node-revoke').exists()).toBe(false)
  })

  it('空步骤 → 空态，不画节点', () => {
    const wrapper = mountGraph([])
    expect(wrapper.findAll('.trace-node')).toHaveLength(0)
    expect(wrapper.text()).toContain('暂无可画的轨迹节点')
  })
})

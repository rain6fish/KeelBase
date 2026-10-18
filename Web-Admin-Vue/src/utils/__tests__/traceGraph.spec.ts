// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import { buildTraceGraph, layoutTraceGraph, traceStepLabelKey } from '../traceGraph'
import type { TraceStep } from '@/types/workbench'

function step(id: string, type: TraceStep['type'], overrides: Partial<TraceStep> = {}): TraceStep {
  return { id, type, time: '2026-10-18T00:00:00Z', ...overrides }
}

describe('buildTraceGraph（节点/边只来自服务端步骤）', () => {
  it('服务端每一步 → 一个节点，服务端相邻步 → 一条边', () => {
    const graph = buildTraceGraph([
      step('a', 'input'),
      step('b', 'tool_call', { toolName: 'query_customers', success: true }),
      step('c', 'confirmation', { outcome: 'approve' }),
      step('d', 'effect', { effect: { effectId: 1, resultType: 'crm_task', resultId: 7, revocable: true } }),
    ])

    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(graph.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
    ])
  })

  it('缺 id 的步骤不画节点，且断链不补边（守卫；拿掉即红）', () => {
    const graph = buildTraceGraph([
      step('a', 'input'),
      step('b', 'assistant'),
      step('', 'tool_call'),
      step('d', 'effect'),
    ])

    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'd'])
    // b 与 d 在原数组里不相邻，不能凭空连一条边。
    expect(graph.edges).toEqual([{ from: 'a', to: 'b' }])
  })

  it('空数组 → 无节点无边', () => {
    expect(buildTraceGraph([])).toEqual({ nodes: [], edges: [] })
  })
})

describe('layoutTraceGraph（纯几何，不改服务端数据）', () => {
  it('多行蛇形布局：节点数/边数不变，每条边都有路径', () => {
    const graph = buildTraceGraph(Array.from({ length: 6 }, (_, i) => step(`s${i}`, 'tool_call')))
    const layout = layoutTraceGraph(graph, 4)

    expect(layout.nodes).toHaveLength(6)
    expect(layout.edges).toHaveLength(5)
    expect(layout.edges.every((e) => e.d.startsWith('M '))).toBe(true)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
  })

  it('空图 → 尺寸 0', () => {
    expect(layoutTraceGraph(buildTraceGraph([]))).toEqual({ width: 0, height: 0, nodes: [], edges: [] })
  })

  it('步骤类型 → i18n key', () => {
    expect(traceStepLabelKey('input')).toBe('stepInput')
    expect(traceStepLabelKey('effect')).toBe('stepEffect')
    expect(traceStepLabelKey('unknown')).toBe('stepNotice')
  })
})

// SPDX-License-Identifier: Apache-2.0

import type { TraceStep } from '@/types/workbench'

/**
 * Nodes and edges for the Agent decision trace graph.
 *
 * Both are derived **only** from what the server sent: a node exists exactly when the server
 * supplied a trace step with an `id`, and an edge exists exactly between two steps that were
 * adjacent in the server's own (already time-sorted) `steps` array. The front end never invents a
 * node, an edge, or a link between a tool call and its effect.
 *
 * 决策轨迹图的节点与边。
 * 两者都**只**由服务端给出的数据推导：服务端给了带 `id` 的步骤才有节点；只有服务端那份（已按时间
 * 排序的）`steps` 数组里相邻的两步之间才有边。前端不造节点、不造边，也不自行把工具调用与副作用
 * 连起来。
 */
export interface TraceGraphNode {
  id: string
  type: string
  step: TraceStep
  /** Index in the server's steps array — edges are judged on this, not on render order. */
  sourceIndex: number
}

export interface TraceGraphEdge {
  from: string
  to: string
}

export interface TraceGraph {
  nodes: TraceGraphNode[]
  edges: TraceGraphEdge[]
}

export function buildTraceGraph(steps: readonly TraceStep[] = []): TraceGraph {
  const nodes: TraceGraphNode[] = []
  steps.forEach((step, sourceIndex) => {
    // Guard: no server id, no node. Removing this check must turn the missing-id tests red.
    if (!step || !step.id) return
    nodes.push({ id: step.id, type: step.type, step, sourceIndex })
  })

  const edges: TraceGraphEdge[] = []
  for (let i = 1; i < nodes.length; i += 1) {
    // Guard: a dropped step breaks the chain — never bridge the gap with an invented edge.
    if (nodes[i].sourceIndex - nodes[i - 1].sourceIndex !== 1) continue
    edges.push({ from: nodes[i - 1].id, to: nodes[i].id })
  }

  return { nodes, edges }
}

/** Step type → i18n label key (shared by the graph and the trace timeline). */
export function traceStepLabelKey(type: string): string {
  switch (type) {
    case 'input': return 'stepInput'
    case 'assistant': return 'stepAssistant'
    case 'tool_call': return 'stepToolCall'
    case 'confirmation': return 'stepConfirmation'
    case 'effect': return 'stepEffect'
    default: return 'stepNotice'
  }
}

export const TRACE_GRAPH_COLS = 3
export const TRACE_NODE_W = 180
export const TRACE_NODE_H = 88
export const TRACE_GAP_X = 56
export const TRACE_GAP_Y = 56

export interface TraceGraphLayoutNode extends TraceGraphNode {
  x: number
  y: number
}

export interface TraceGraphLayoutEdge extends TraceGraphEdge {
  /** SVG path for the edge. */
  d: string
}

export interface TraceGraphLayout {
  width: number
  height: number
  nodes: TraceGraphLayoutNode[]
  edges: TraceGraphLayoutEdge[]
}

/**
 * Serpentine layout: row 0 left→right, row 1 right→left, and so on, so every row transition is a
 * straight vertical edge at the same x. Pure geometry — no server data is added or changed.
 */
export function layoutTraceGraph(graph: TraceGraph, cols = TRACE_GRAPH_COLS): TraceGraphLayout {
  const count = graph.nodes.length
  if (count === 0) return { width: 0, height: 0, nodes: [], edges: [] }

  const nodes: TraceGraphLayoutNode[] = graph.nodes.map((node, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    const inRow = Math.min(cols, count - row * cols)
    const visualCol = row % 2 === 0 ? col : inRow - 1 - col
    return {
      ...node,
      x: visualCol * (TRACE_NODE_W + TRACE_GAP_X),
      y: row * (TRACE_NODE_H + TRACE_GAP_Y),
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges: TraceGraphLayoutEdge[] = graph.edges.map((edge) => ({
    ...edge,
    d: edgePath(byId.get(edge.from)!, byId.get(edge.to)!),
  }))

  return {
    width: Math.max(...nodes.map((n) => n.x + TRACE_NODE_W)),
    height: Math.max(...nodes.map((n) => n.y + TRACE_NODE_H)),
    nodes,
    edges,
  }
}

function edgePath(from: TraceGraphLayoutNode, to: TraceGraphLayoutNode): string {
  if (from.y !== to.y) {
    // Row transition: down to the midline, across, then down. A short final row is not aligned
    // with the previous row's last node, so the path must not assume a shared x.
    const yMid = (from.y + TRACE_NODE_H + to.y) / 2
    const x1 = from.x + TRACE_NODE_W / 2
    const x2 = to.x + TRACE_NODE_W / 2
    return `M ${x1} ${from.y + TRACE_NODE_H} L ${x1} ${yMid} L ${x2} ${yMid} L ${x2} ${to.y}`
  }
  const y = from.y + TRACE_NODE_H / 2
  if (to.x > from.x) return `M ${from.x + TRACE_NODE_W} ${y} L ${to.x} ${y}`
  return `M ${from.x} ${y} L ${to.x + TRACE_NODE_W} ${y}`
}

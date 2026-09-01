// SPDX-License-Identifier: Apache-2.0

/** D1 Human-Agent-System Accountability：trace 步骤来源分类（人 / AI / 系统） */

export type TraceSource = 'human' | 'agent' | 'system'

export function traceSource(type: string): TraceSource {
  if (type === 'input' || type === 'confirmation') return 'human'
  if (type === 'assistant' || type === 'tool_call') return 'agent'
  return 'system'
}

export function traceSourceKey(src: TraceSource): string {
  if (src === 'human') return 'traceSourceHuman'
  if (src === 'agent') return 'traceSourceAgent'
  return 'traceSourceSystem'
}

export function traceSourceTagType(src: TraceSource): 'success' | 'primary' | 'info' {
  if (src === 'human') return 'success'
  if (src === 'agent') return 'primary'
  return 'info'
}

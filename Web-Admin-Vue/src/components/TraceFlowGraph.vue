<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="trace-graph">
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
      <span class="text-caption text-medium-emphasis trace-graph-stats">
        {{ t('traceGraphStats', { nodes: graph.nodes.length, edges: graph.edges.length }) }}
      </span>
      <div class="d-flex align-center flex-wrap ga-3 text-caption text-medium-emphasis">
        <span v-for="l in legend" :key="l.type" class="d-flex align-center ga-1">
          <span class="legend-dot" :style="{ background: l.color }" />{{ t(l.label) }}
        </span>
      </div>
    </div>

    <el-empty v-if="graph.nodes.length === 0" :description="t('traceGraphEmpty')" :image-size="60" />

    <div v-else class="graph-scroll" data-testid="trace-graph-canvas">
      <div class="graph-canvas" :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
        <svg class="graph-edges" :width="layout.width" :height="layout.height">
          <defs>
            <marker
              id="trace-graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <path
            v-for="e in layout.edges"
            :key="`${e.from}-${e.to}`"
            class="graph-edge"
            :data-from="e.from"
            :data-to="e.to"
            :d="e.d"
            marker-end="url(#trace-graph-arrow)"
          />
        </svg>

        <div
          v-for="n in layout.nodes"
          :key="n.id"
          class="trace-node"
          :class="[`node-${nodeTone(n.step)}`, { selected: n.id === selectedId }]"
          :data-step-id="n.id"
          :data-step-type="n.step.type"
          :style="{ left: n.x + 'px', top: n.y + 'px', width: TRACE_NODE_W + 'px', height: TRACE_NODE_H + 'px' }"
          role="button"
          tabindex="0"
          @click="emit('select', n.step)"
          @keydown.enter.prevent="emit('select', n.step)"
          @keydown.space.prevent="emit('select', n.step)"
        >
          <div class="d-flex align-center ga-1 node-head">
            <AppIcon :icon="nodeIcon(n.step)" size="14" />
            <span class="node-type">{{ t(traceStepLabelKey(n.step.type)) }}</span>
            <el-tag size="small" effect="plain" :type="traceSourceTagType(traceSource(n.step.type))">
              {{ t(traceSourceKey(traceSource(n.step.type))) }}
            </el-tag>
          </div>
          <div class="node-title">{{ nodeTitle(n.step) }}</div>
          <div class="node-foot">
            <span class="node-status text-caption">{{ nodeStatus(n.step) }}</span>
            <el-button
              v-if="n.step.type === 'effect' && n.step.effect && n.step.effect.revocable"
              size="small"
              type="warning"
              plain
              class="node-revoke"
              @click.stop="revoke(n.step)"
            >
              {{ t('revokeEffect') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { toolLabel } from '@/utils/businessLabel'
import { traceSource, traceSourceKey, traceSourceTagType } from '@/utils/traceSource'
import {
  buildTraceGraph,
  layoutTraceGraph,
  traceStepLabelKey,
  TRACE_NODE_W,
  TRACE_NODE_H,
} from '@/utils/traceGraph'
import type { TraceStep, TraceEffect } from '@/types/workbench'

/**
 * Agent decision trace graph. Every node is a server trace step and every edge is an adjacency in
 * the server's own ordered step list (see utils/traceGraph.ts). The component adds no nodes and no
 * links of its own; it only lays them out and renders their server readings.
 *
 * Agent 决策轨迹图。每个节点都是服务端 trace 的一步，每条边都是服务端有序步骤列表里的相邻关系
 * （见 utils/traceGraph.ts）。组件不自行增加节点或连线，只负责布局并渲染它们的服务端读数。
 */
const props = withDefaults(
  defineProps<{
    steps: TraceStep[]
    selectedId?: string | null
  }>(),
  { selectedId: null },
)
const emit = defineEmits<{ select: [step: TraceStep]; revoke: [effect: TraceEffect] }>()

const { t, tm } = useI18n()

const graph = computed(() => buildTraceGraph(props.steps))
const layout = computed(() => layoutTraceGraph(graph.value))

const legend = [
  { type: 'input', label: 'stepInput', color: 'var(--el-color-info)' },
  { type: 'assistant', label: 'stepAssistant', color: 'var(--el-color-primary)' },
  { type: 'tool_call', label: 'stepToolCall', color: 'var(--el-color-primary)' },
  { type: 'confirmation', label: 'stepConfirmation', color: 'var(--el-color-warning)' },
  { type: 'effect', label: 'stepEffect', color: 'var(--el-color-success)' },
] as const

/** Tone mirrors server fields only (success/outcome/error) — no local state machine. */
function nodeTone(step: TraceStep): string {
  if (step.type === 'input') return 'info'
  if (step.type === 'assistant') return 'primary'
  if (step.type === 'tool_call') return step.success === false ? 'danger' : 'primary'
  if (step.type === 'confirmation') {
    if (step.outcome === 'approve') return 'success'
    if (step.outcome === 'decline') return 'danger'
    return 'warning'
  }
  if (step.type === 'effect') return 'success'
  return step.errorMessage ? 'danger' : 'neutral'
}

function nodeIcon(step: TraceStep): string {
  if (step.type === 'input') return 'mdi-account-arrow-right-outline'
  if (step.type === 'assistant') return 'mdi-robot-outline'
  if (step.type === 'tool_call') return 'mdi-wrench-outline'
  if (step.type === 'confirmation') return 'mdi-shield-check-outline'
  if (step.type === 'effect') return 'mdi-content-save-outline'
  return step.errorMessage ? 'mdi-alert-circle-outline' : 'mdi-message-outline'
}

function nodeTitle(step: TraceStep): string {
  if (step.type === 'tool_call' || step.type === 'confirmation') {
    return truncate(toolLabel(tm('feature'), step.toolName))
  }
  if (step.type === 'effect') {
    const label = step.toolName ? toolLabel(tm('feature'), step.toolName) : ''
    const target = step.effect
      ? step.effect.targetTitle || `${step.effect.resultType} #${step.effect.resultId}`
      : ''
    return truncate([label, target].filter(Boolean).join(' → '))
  }
  return truncate(step.content || step.detail || step.errorMessage || '')
}

function nodeStatus(step: TraceStep): string {
  if (step.type === 'tool_call') return step.success === false ? t('stepFailed') : t('stepSuccess')
  if (step.type === 'confirmation') {
    if (step.outcome === 'approve') return t('stepApproved')
    if (step.outcome === 'decline') return t('stepDeclined')
    if (step.outcome === 'pending_approval') return t('stepPendingApproval')
    return t('stepTimedOut')
  }
  if (step.type === 'effect' && step.effect) {
    const base = `${step.effect.resultType} #${step.effect.resultId}`
    const status = effectStatusLabel(step.effect.status)
    return status ? `${base} · ${status}` : base
  }
  return ''
}

/**
 * Effect status label — the trace's own reading, never a local inference. An absent or unrecognized
 * value stays unlabelled: unknown must not be rendered as "executed".
 *
 * 副作用状态标签 —— 只用 trace 自己的读数，不做本地推断。缺席或认不出的值一律不标注：
 * 「不知道」不能被渲染成「已执行」。
 */
function effectStatusLabel(status?: string): string {
  if (!status) return ''
  if (status === 'revoked') return t('lifecycleRevoked')
  if (status === 'revoking_external') return t('statusRevokingExternal')
  if (status === 'revoke_failed') return t('statusRevokeFailed')
  if (status === 'executed') return t('lifecycleExecuted')
  return ''
}

function revoke(step: TraceStep): void {
  if (step.effect) emit('revoke', step.effect)
}

function truncate(text: string | null | undefined, max = 42): string {
  const s = (text || '').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}
</script>

<style scoped>
.graph-scroll {
  overflow-x: auto;
  padding: 4px;
}
.graph-canvas {
  position: relative;
}
.graph-edges {
  position: absolute;
  inset: 0;
  color: var(--el-border-color);
  overflow: visible;
}
.graph-edge {
  fill: none;
  stroke: var(--el-border-color);
  stroke-width: 1.5;
}
.trace-node {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-left-width: 3px;
  border-radius: 10px;
  background: var(--el-bg-color);
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.trace-node:hover,
.trace-node:focus-visible {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 10px rgba(29, 78, 216, 0.18);
  outline: none;
}
.trace-node.selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}
.trace-node.node-primary { border-left-color: var(--el-color-primary); }
.trace-node.node-success { border-left-color: var(--el-color-success); }
.trace-node.node-warning { border-left-color: var(--el-color-warning); }
.trace-node.node-danger { border-left-color: var(--el-color-danger); }
.trace-node.node-info { border-left-color: var(--el-color-info); }
.trace-node.node-neutral { border-left-color: var(--el-border-color); }
.node-head {
  min-width: 0;
  white-space: nowrap;
}
.node-type {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-title {
  height: 18px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 22px;
  margin-top: auto;
}
.node-status {
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-revoke {
  flex: none;
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
}
.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
</style>

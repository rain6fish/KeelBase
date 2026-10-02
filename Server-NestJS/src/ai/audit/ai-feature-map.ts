// SPDX-License-Identifier: Apache-2.0

/**
 * AI 审计「人类可读动作」映射（internal-roadmap §internal.10 D2：人类语言审计标签）。
 *
 * 复用操作审计 feature-map.ts 的思路（语义 key + fallback，前端按语言渲染），
 * 扩到 AI 审计：把技术 action 枚举（chat / tool_call / …）映射为人类可读描述，
 * 并从 detail 提取工具名附加（「AI · Tool call · create_followup_task」）。
 * 原则 3：审计要能看懂「AI 做了什么」，而不只是技术枚举值。
 */

import { parseToolCall } from './tool-name';
import { TOOL_METADATA, toolLabelKey } from './tool-metadata';

export interface AiActionLabel {
  /** 语义 key（前端 i18n 用），如 ai.toolCall */
  key: string;
  /** 兜底英文描述（前端无 i18n 条目时显示），如 AI · Tool call */
  fallback: string;
}

/** AI 审计 action 枚举 → 语义 key + fallback。未命中的 action 走兜底（ai.<action>）。 */
const ACTION_LABELS: Record<string, AiActionLabel> = {
  chat: { key: 'ai.chat', fallback: 'AI · Chat' },
  tool_call: { key: 'ai.toolCall', fallback: 'AI · Tool call' },
  tool_confirmation: { key: 'ai.confirmation', fallback: 'AI · Confirmation' },
  navigate: { key: 'ai.navigate', fallback: 'AI · Navigate page' },
  plan: { key: 'ai.plan', fallback: 'AI · Plan' },
  analyze: { key: 'ai.analyze', fallback: 'AI · Analyze' },
  knowledge: { key: 'ai.knowledge', fallback: 'AI · Knowledge' },
  delegate: { key: 'ai.delegate', fallback: 'AI · Delegate' },
  flow_node: { key: 'ai.flowNode', fallback: 'AI · Flow node' },
  login: { key: 'ai.login', fallback: 'AI · Login' },
  error: { key: 'ai.error', fallback: 'AI · Error' },
  content_blocked: { key: 'ai.contentBlocked', fallback: 'AI · Content blocked' },
};

/**
 * AI 工具名 → 人类可读标签（D2 工具名级映射：create_followup_task → Create follow-up task）。
 *
 * 派生自 `tool-metadata.ts` 的单一表：**key 机械派生**、不手写。此前本表手动维护，已与真实工具名
 * 漂移（给 `query_contacts` 这类**不存在**的名字留了标签，而有 12 个真工具没有标签）。
 */
const TOOL_LABELS: Record<string, AiActionLabel> = Object.fromEntries(
  Object.entries(TOOL_METADATA).map(([name, meta]) => [
    name,
    { key: toolLabelKey(name), fallback: meta.label },
  ]),
);

/** detail 提取工具名：走共享解析器（`toolName({args})` 与 `Tool: toolName` 两种形态都在里面）。 */
function extractToolName(detail: string): string | null {
  return parseToolCall(detail)?.toolName ?? null;
}

export function aiActionLabel(action: string, detail?: string | null): AiActionLabel {
  const base = ACTION_LABELS[action] ?? {
    key: `ai.${action}`,
    fallback: `AI · ${action}`,
  };
  if (!detail) return base;
  const tool = extractToolName(detail);
  if (tool && TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  if (tool) return { key: base.key, fallback: `${base.fallback} · ${tool}` };
  return base;
}

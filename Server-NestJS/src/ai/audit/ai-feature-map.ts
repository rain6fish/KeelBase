/**
 * AI 审计「人类可读动作」映射（roadmap §22.10 D2：人类语言审计标签）。
 *
 * 复用操作审计 feature-map.ts 的思路（语义 key + fallback，前端按语言渲染），
 * 扩到 AI 审计：把技术 action 枚举（chat / tool_call / …）映射为人类可读描述，
 * 并从 detail 提取工具名附加（「AI · Tool call · create_followup_task」）。
 * 原则 3：审计要能看懂「AI 做了什么」，而不只是技术枚举值。
 */

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
};

/** detail 里提取工具名（Tool: <name> 或裸工具名），供附加显示。 */
const TOOL_PATTERN = /\b(create|update|query|analyze|delete|get|list|review|submit|revoke)_[a-z0-9_]+/;

export function aiActionLabel(action: string, detail?: string | null): AiActionLabel {
  const base = ACTION_LABELS[action] ?? {
    key: `ai.${action}`,
    fallback: `AI · ${action}`,
  };
  if (!detail) return base;
  const tool = detail.match(TOOL_PATTERN)?.[0];
  if (!tool) return base;
  return { key: base.key, fallback: `${base.fallback} · ${tool}` };
}

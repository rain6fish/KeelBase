// SPDX-License-Identifier: Apache-2.0

/**
 * AI 写工具 → 副作用 resultType 推导（#4 陌生人实测卡点修复）。
 * 此前在写工具执行路径内硬编码工具名链、兜底 'todo'——生成模块的 create_<module> 全部
 * 落到 'todo' + 错 id（撤销指错记录）。改为：显式别名 + create_ 通用推导；非 create 且无别名 → null（不记录，fail-closed）。
 */
/**
 * 副作用 `resultType` 的**跨模块固定取值**（单源；wire schema 里该字段是自由字符串、不是枚举，
 * 但「副作用登记」与「确认卡影响预览」必须给出**同一个值**——见 docs/impact-preview.spec.md 的单一真源条）。
 *
 * - `proxy_call` —— B 路径（另一运行时 / AI Bridge）代理写；有 `ExternalRevoker` 补偿端点 → `governed_external`。
 * - `external_call` —— 外部 MCP 写工具；KeelBase 与 MCP server 之间**没有补偿通道** → `revokeClass=none`
 *   （**不可撤**）。该行存在是为了**幂等**（防同一调用重放成一次真实外部写）与**可追溯**，不是可撤销承诺。
 *
 * Fixed `resultType` values shared across modules — the registration path and the confirmation card's
 * impact preview must agree on the same value, so the literals live here instead of at each call site.
 */
export const PROXY_CALL_EFFECT_TYPE = 'proxy_call';
export const EXTERNAL_CALL_EFFECT_TYPE = 'external_call';

const WRITE_EFFECT_ALIAS: Record<string, string> = {
  create_event: 'event',
  create_todo: 'todo',
  create_followup_task: 'crm_task',
  create_project_task: 'pm_task',
  submit_approval_request: 'app_request',
  create_contract: 'contract',
};

export function writeEffectTypeFor(toolName: string): string | null {
  const alias = WRITE_EFFECT_ALIAS[toolName];
  if (alias) return alias;
  if (toolName.startsWith('create_')) {
    const derived = toolName.slice('create_'.length);
    return derived || null;
  }
  return null;
}

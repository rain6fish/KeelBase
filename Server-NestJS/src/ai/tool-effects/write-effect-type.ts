// SPDX-License-Identifier: Apache-2.0

/**
 * AI 写工具 → 副作用 resultType 推导（#4 陌生人实测卡点修复）。
 * 此前在 _executeWriteTool 内硬编码工具名链、兜底 'todo'——生成模块的 create_<module> 全部
 * 落到 'todo' + 错 id（撤销指错记录）。改为：显式别名 + create_ 通用推导；非 create 且无别名 → null（不记录，fail-closed）。
 */
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

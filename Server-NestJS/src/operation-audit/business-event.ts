// SPDX-License-Identifier: Apache-2.0

/**
 * A-1 业务事件归一化：把 method + path 归一为「业务事件名」（如 CustomerUpdated / FollowupTaskCreated）。
 * 目的：跨系统（Java / REST / MCP / DB / Node）底层日志不同，审计人员看到的都是统一业务语言。
 *
 * 资源名不在这里另立一份 —— 它来自 `resource-routes.ts` 的单一表（与操作审计取 before 快照的
 * 实体映射同源），此前两份手抄已漂移。
 */

import { resourceEventFor } from './resource-routes';

const ACTION_SUFFIX: Record<string, string> = {
  POST: 'Created',
  PATCH: 'Updated',
  PUT: 'Updated',
  DELETE: 'Deleted',
};

/** 非业务事件路径（基础设施/平台管理，不作为业务行为留痕） */
const NON_BUSINESS: Array<RegExp> = [
  /\/auth\//,
  /\/ai\//,
  /\/upload/,
  /\/notifications/,
  /\/settings/,
  /\/push\//,
  /\/webhooks/,
  /\/points\//,
  /\/admin\//,
  /\/health/,
  /\/metrics/,
  /\/search/,
  /\/forms\//,
  /\/plugins\//,
  /\/mcp/,
  /\/external\//,
  /\/internal\//,
];

export function deriveBusinessEvent(path: string, method: string): string | null {
  const p = path.split('?')[0];
  const suffix = ACTION_SUFFIX[method.toUpperCase()];
  if (!suffix) return null;
  for (const re of NON_BUSINESS) if (re.test(p)) return null;
  const name = resourceEventFor(p);
  return name ? `${name}${suffix}` : null;
}

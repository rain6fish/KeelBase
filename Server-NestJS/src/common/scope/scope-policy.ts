// SPDX-License-Identifier: Apache-2.0

import type { ScopeDescriptor, ScopeLevel } from './scope.types';

/**
 * 权限-2 数据范围 · 级别来源（policy seam）。
 *
 * **Step 1 的级别来源 = 内建默认，逐 subject 复刻今天的行为**——
 * - `Todo` / `Event`：有组织 → `org`（等价于今天的 `[{userId}] OR [{orgId}]`）；无组织 → `own`
 * - 其余（CRM / PM / Approval）：`own`（今天即 owner-only）
 *
 * Step 2 把本函数换成"按角色配置"（`roles.data_scope`），调用方不变。
 */

/** 用户的组织上下文（非成员为 null） */
export interface OrgContext {
  orgId: number;
  deptId: number | null;
}

const ORG_LEVEL_SUBJECTS = new Set<string>(['Todo', 'Event']);

/** 构造数据范围描述子。 */
export function defaultScopeDescriptor(
  userId: number,
  subject: string,
  ctx: OrgContext | null,
): ScopeDescriptor {
  const level: ScopeLevel = ctx != null && ORG_LEVEL_SUBJECTS.has(subject) ? 'org' : 'own';
  return {
    userId,
    orgId: ctx?.orgId ?? null,
    deptId: ctx?.deptId ?? null,
    level,
    deptSubtreeIds: [],
  };
}

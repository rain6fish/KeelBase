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

/**
 * Subjects that register themselves for the org level — the generated modules whose spec declared a
 * `scope`. Same seam as the column registry: the generator emits the call into the module file, so a
 * generated module defaults to "own or same org" without anyone editing this file.
 *
 * 自己登记进「组织级」的 subject —— spec 声明了 `scope` 的生成模块。与列登记同一个缝：生成器把调用写进
 * 模块文件，于是生成模块缺省即「本人或同组织」，无需任何人改这个文件。
 */
const registeredOrgLevelSubjects = new Set<string>();

/** 登记一个 subject 按缺省走 `org` 级（生成模块在 import 时调用）。 */
export function registerOrgLevelSubject(subject: string): void {
  registeredOrgLevelSubjects.add(subject);
}

/** 构造数据范围描述子。 */
export function defaultScopeDescriptor(
  userId: number,
  subject: string,
  ctx: OrgContext | null,
): ScopeDescriptor {
  const orgLevel = ORG_LEVEL_SUBJECTS.has(subject) || registeredOrgLevelSubjects.has(subject);
  const level: ScopeLevel = ctx != null && orgLevel ? 'org' : 'own';
  return {
    userId,
    orgId: ctx?.orgId ?? null,
    deptId: ctx?.deptId ?? null,
    level,
    deptSubtreeIds: [],
  };
}

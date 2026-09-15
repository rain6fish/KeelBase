// SPDX-License-Identifier: Apache-2.0

import { In } from 'typeorm';
import type { ScopeDescriptor } from './scope.types';

/**
 * 权限-2 通用数据范围 · 结构化 where 构造。
 *
 * **只产 TypeORM where 对象，不拼 SQL 串**——避免注入面，保住可解释性。
 * （对照：同类企业脚手架用 AOP 注入 + 查询侧拼串；这里取思路、弃实现。）
 */

/** 实体在数据范围中的列映射 */
export interface ScopeColumns {
  /** 归属列（行级所有权） */
  owner?: string;
  /** 组织列 */
  org?: string;
  /** 部门列 */
  dept?: string;
}

/**
 * 可被数据范围过滤的实体登记表（subject → 列映射）。
 * **未登记 = 该 subject 不可范围过滤**，调用方须保持自身 owner 条件，**绝不静默放宽**。
 * 用 registry map 而非实体装饰器：一个可审阅的文件、实体零改动。
 */
export const SCOPE_COLUMNS = {
  Todo: { owner: 'userId', org: 'orgId', dept: 'deptId' },
  Event: { owner: 'userId', org: 'orgId', dept: 'deptId' },
  CrmCustomer: { owner: 'userId', org: 'orgId', dept: 'deptId' },
  PmProject: { owner: 'userId', org: 'orgId', dept: 'deptId' },
  ApprovalRequest: { owner: 'requesterId', org: 'orgId', dept: 'deptId' },
} as const;

export type ScopeSubject = keyof typeof SCOPE_COLUMNS;

export type ScopeWhere<T> = T | T[];

/**
 * 由描述子构造行级 where（TypeORM 的 OR 语义用数组表达）。
 *
 * @returns where 对象 / 数组；`null` = 不施加行级约束（level = `all`）
 *
 * 降级规则：缺组织/部门信息时一律**退回本人**（收紧而非放宽）。
 */
export function buildScopeWhere<T = Record<string, unknown>>(
  desc: ScopeDescriptor,
  subject: ScopeSubject,
): T[] | null {
  const cols = SCOPE_COLUMNS[subject] as ScopeColumns;
  const own = { [cols.owner as string]: desc.userId } as T;

  if (desc.level === 'all') return null;
  if (desc.level === 'own') return [own];

  // 以下级别都需要组织信息；缺则退回本人
  if (!cols.org || desc.orgId == null) return [own];

  if (desc.level === 'org') {
    return [own, { [cols.org]: desc.orgId } as T];
  }

  if (desc.level === 'custom_dept') {
    if (!cols.dept || !desc.customDeptIds?.length) return [own];
    return [{ [cols.dept]: In(desc.customDeptIds) } as T];
  }

  if (!cols.dept || desc.deptId == null) return [own];

  if (desc.level === 'own_dept') {
    return [own, { [cols.org]: desc.orgId, [cols.dept]: desc.deptId } as T];
  }

  // own_dept_and_below
  if (desc.deptSubtreeIds.length === 0) return [own];
  return [own, { [cols.org]: desc.orgId, [cols.dept]: In(desc.deptSubtreeIds) } as T];
}

/**
 * 对象级同一判定（供明细/单条访问用，与列表 where 同源，避免「列表可见但明细 403」）。
 * 只判数据范围本身；CASL 的 action × subject 粗门由调用方先行判定。
 */
export function rowInScope<T extends Record<string, unknown>>(
  row: T,
  desc: ScopeDescriptor,
  subject: ScopeSubject,
): boolean {
  const cols = SCOPE_COLUMNS[subject] as ScopeColumns;

  if (desc.level === 'all') return true;
  if (Number(row[cols.owner as string]) === desc.userId) return true;
  if (desc.level === 'own') return false;

  if (!cols.org || desc.orgId == null) return false;
  if (Number(row[cols.org]) !== desc.orgId) return false;
  if (desc.level === 'org') return true;

  const deptVal = cols.dept != null ? row[cols.dept] : null;
  if (deptVal == null) return false;

  switch (desc.level) {
    case 'own_dept':
      return desc.deptId != null && Number(deptVal) === desc.deptId;
    case 'own_dept_and_below':
      return desc.deptSubtreeIds.includes(Number(deptVal));
    case 'custom_dept':
      return (desc.customDeptIds ?? []).includes(Number(deptVal));
    default:
      return false;
  }
}

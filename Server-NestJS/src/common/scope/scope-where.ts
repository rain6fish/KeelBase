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

/**
 * Subjects that register themselves — today, the generated modules whose spec declared a `scope`.
 *
 * `SCOPE_COLUMNS` above stays the hand-written half (its entries are reviewed by a human and pinned
 * by a spec); this is the half that arrives from generated code. The generator emits the registration
 * call into the module file, right where it already emits `registerSensitiveKeys` for `pii`, so a
 * generated module joins the scope system **without anyone editing this file** — and without the
 * module list being read from disk on every query.
 *
 * 自己登记自己的 subject —— 今天即 spec 声明了 `scope` 的生成模块。
 *
 * 上面的 `SCOPE_COLUMNS` 仍是手工那一半（有人审、有 spec 钉住）；这一半来自生成代码。生成器把登记调用
 * 写进模块文件 —— 就在它已经为 `pii` 写 `registerSensitiveKeys` 的位置 —— 于是生成模块**无需任何人改
 * 这个文件**就加入了范围体系，也不必每次查询都去磁盘读一遍模块清单。
 */
const registeredColumns = new Map<string, ScopeColumns>();

/** 登记一个 subject 的列映射（生成模块在 import 时调用；重复登记以最后一次为准）。 */
export function registerScopeColumns(subject: string, columns: ScopeColumns): void {
  registeredColumns.set(subject, columns);
}

/**
 * The columns for a subject, or `null` when nothing registered it.
 *
 * 该 subject 的列；无人登记过则为 `null`。
 */
function columnsFor(subject: string): ScopeColumns | null {
  return (SCOPE_COLUMNS as Record<string, ScopeColumns>)[subject] ?? registeredColumns.get(subject) ?? null;
}

export type ScopeWhere<T> = T | T[];

/**
 * A subject reference: one of the built-in five, or a name a generated module registered for itself.
 *
 * 一个 subject 引用：内置五个之一，或生成模块自己登记的名字。
 */
export type ScopeSubjectRef = ScopeSubject | (string & {});

/**
 * 由描述子构造行级 where（TypeORM 的 OR 语义用数组表达）。
 *
 * @returns where 对象 / 数组；`null` = 不施加行级约束（level = `all`）
 *
 * 降级规则：缺组织/部门信息时一律**退回本人**（收紧而非放宽）。
 */
export function buildScopeWhere<T = Record<string, unknown>>(
  desc: ScopeDescriptor,
  subject: ScopeSubjectRef,
): T[] | null {
  const cols = columnsFor(subject);
  // Unregistered ⇒ owner-only, in the fallback's own shape: `userId`, which is the owner column
  // every generated module's fixed wiring uses. The built-in five are always registered, so this
  // branch is only ever reached by a generated module whose self-registration did not run — and the
  // answer there is the tightest one, not a wide open query.
  // 未登记 ⇒ 只回本人，且用回退自己的形状：`userId` —— 生成模块的固定接线用的正是这个归属列。内置五个
  // 始终已登记，故这一支只会在「生成模块的自登记没跑」时命中 —— 而那时的答案是**最紧**的那个，不是放开。
  if (!cols) return [{ userId: desc.userId } as T];
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
  subject: ScopeSubjectRef,
): boolean {
  const cols = columnsFor(subject);

  if (desc.level === 'all') return true;
  // Same fallback as buildScopeWhere: owner-only, in the generated modules' fixed shape.
  // 与 buildScopeWhere 同一处回退：只认本人，用生成模块的固定形状。
  if (!cols) return Number(row.userId) === desc.userId;
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

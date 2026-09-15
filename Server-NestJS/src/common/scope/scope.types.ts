// SPDX-License-Identifier: Apache-2.0

/**
 * 权限-2 通用数据范围 · 描述子。
 *
 * **内部对象，不出线缆**——C1 冻结的是 wire 契约；本对象不跨边界，冻结它只会给内部重构加税。
 * （`org-membership-scope` 描述的是"用户的组织归属"，不是"数据范围规则"，两者不混用。）
 */

/** 数据范围级别 */
export type ScopeLevel =
  /** 仅本人（owner 列） */
  | 'own'
  /** 本人 + 本部门 */
  | 'own_dept'
  /** 本人 + 本部门及以下（子树） */
  | 'own_dept_and_below'
  /** 本人 + 本组织 */
  | 'org'
  /** 自定义部门集 */
  | 'custom_dept'
  /** 不施加行级约束（由 CASL 的 manage all 承担粗门） */
  | 'all';

/** 解析后的数据范围描述子 */
export interface ScopeDescriptor {
  userId: number;
  /** 用户所属组织；null = 非组织成员 */
  orgId: number | null;
  /** 用户所属部门；null = 未分配部门 */
  deptId: number | null;
  level: ScopeLevel;
  /** level = own_dept_and_below 时的部门子树（含自身）；其余为空数组 */
  deptSubtreeIds: number[];
  /** level = custom_dept 时的自定义部门集 */
  customDeptIds?: number[];
}

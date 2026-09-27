// SPDX-License-Identifier: Apache-2.0

import { defaultScopeDescriptor, type OrgContext } from './scope-policy';
import type { ScopeDescriptor } from './scope.types';
import type { OrgService } from '../../org/org.service';
import type { DataScopeService } from '../../authz/data-scope.service';

/**
 * Resolving a caller's data scope, in one place.
 *
 * `TodosService` and `EventsService` each carried a private copy of these two methods, and generated
 * modules would have made it three and then four — one per module that declares a `scope`. The rule
 * they encode is not obvious enough to be worth re-deriving per caller: where the level comes from
 * (role configuration first, built-in default second), and what "no organisation" means (fall back to
 * owner-only, never widen).
 *
 * Both dependencies are optional and typed only, so a caller that was constructed without them —
 * every unit test, and any deployment that never wired the org module — degrades to the owner-only
 * default instead of failing. The type-only imports also keep this file from forming a runtime cycle
 * with `authz/`, which imports `scope-policy` back.
 *
 * 解析调用方的数据范围，只此一处。
 *
 * `TodosService` 与 `EventsService` 各自养了一份这两个方法的私有副本，而生成模块会把它变成三份、四份
 * —— 每个声明了 `scope` 的模块一份。它们编码的规则没有那么显然、不值得每个调用方各推一遍：级别从哪来
 * （先角色配置、后内置默认），以及「没有组织」意味着什么（退回仅本人，绝不放宽）。
 *
 * 两个依赖都是可选的、且只作类型引用，故没有它们的调用方 —— 每个单测，以及任何没有接组织模块的部署 ——
 * 会退回「仅本人」的缺省而不是报错。这些**只作类型**的引用也让本文件不会与 `authz/` 形成运行时环
 * （后者反过来 import `scope-policy`）。
 */

/** The caller's org context, or `null` when they belong to none (or none was wired). */
/* 调用方的组织上下文；不属于任何组织（或没有接线）时为 `null`。 */
export async function orgContextOf(
  org: OrgService | null | undefined,
  userId?: number,
): Promise<OrgContext | null> {
  if (!userId || !org) return null;
  try {
    return await org.getUserOrgContext(userId);
  } catch {
    // 组织查询失败不是「放行」的理由：退回无组织 ⇒ 调用方收紧到仅本人
    return null;
  }
}

/**
 * The scope descriptor for this caller and subject: role configuration when present, the built-in
 * default otherwise. Missing configuration only ever tightens.
 *
 * 该调用方在该 subject 上的范围描述子：有角色配置就用它，否则用内置默认。配置缺失只会**收紧**。
 */
export async function resolveScopeDescriptor(
  userId: number,
  subject: string,
  org: OrgService | null | undefined,
  dataScope: DataScopeService | null | undefined,
): Promise<ScopeDescriptor> {
  return dataScope
    ? dataScope.resolve(userId, subject)
    : defaultScopeDescriptor(userId, subject, await orgContextOf(org, userId));
}

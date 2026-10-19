// SPDX-License-Identifier: Apache-2.0

import { UserRole } from '../../common/entities/user.entity';
import type { OrgService } from '../../org/org.service';

/**
 * Who is asking, for row scope. Passed by the controller from the JWT; nothing here guesses it.
 *
 * An **audit reader's organisation comes from the account**, not from the request: organisation is an
 * account attribute in this model (`org_members`, resolved through `OrgService.getUserOrgContext`,
 * which follows the existing "earliest membership" choice, A10). A request `orgId` can only narrow
 * further — it is ANDed with the account scope, never substituted for it. An auditor who belongs to no
 * organisation falls back to their **own** rows (the same tighten-never-widen rule as Data Scope),
 * rather than either seeing everything or being handed an organisation someone picked for them.
 *
 * **Period comes from the request window** (`since` / `until`): today's model has no per-auditor
 * period attribute and no read-plane policy — the audit engagement container (`AW-6`, Gate 2) is not
 * built. So the only period source that exists is the one the caller asks for, and it bounds the rows.
 * Saying "the account owns a period" here would invent a dimension; we do not.
 *
 * 谁在问、用于行范围。由控制器从 JWT 传入；这里不猜任何东西。
 *
 * **审计读者的组织来自账号**，不是来自请求：在这个模型里组织就是账号属性（`org_members`，经
 * `OrgService.getUserOrgContext` 解析，沿用既有的「最早加入」取舍 A10）。请求里的 `orgId` 只能
 * **再收紧** —— 它与账号范围是 AND，绝不能替换掉它。不属于任何组织的审计读者退回**本人**的行
 * （与 Data Scope 同一条「只收紧、不放宽」），而不是要么看全量、要么被塞一个别人挑的组织。
 *
 * **期间来自请求窗口**（`since` / `until`）：今天的模型没有按读者配置的期间属性，也没有读平面策略 ——
 * 审计事项容器（`AW-6`，Gate 2）尚未建成。故今天存在的**唯一**期间来源就是调用者要求的那一段，由它
 * 来限定行。说「账号自带一个期间」等于在这里发明一个维度；我们不这么做。
 */
export interface AuditReaderContext {
  /** JWT `sub` — the caller. */
  userId: number;
  /** JWT `role`. `admin` keeps the unwidened view; an auditor is narrowed. */
  role: UserRole;
}

/** An additional row predicate; `null` means "no narrowing" (admin, or an unidentified caller). */
export type AuditRowScope =
  | { kind: 'org'; orgId: number }
  | { kind: 'own'; userId: number }
  | null;

/**
 * Resolve the reader's row scope. Admin (and an unidentified caller) → `null`; an auditor → their
 * organisation, or — when they belong to none, or the lookup fails — their own rows.
 *
 * A failed lookup is not a reason to widen: it falls back to the narrowest answer.
 *
 * 解析读者的行范围。管理员（以及没有身份的调用者）→ `null`；审计读者 → 其组织，或者 —— 不属于任何
 * 组织、或查询失败时 —— 本人的行。查询失败不是放宽的理由：退到最窄的答案。
 */
export async function resolveAuditReaderScope(
  reader: AuditReaderContext | undefined,
  orgService: OrgService | null | undefined,
): Promise<AuditRowScope> {
  if (!reader) return null;
  if (reader.role === UserRole.ADMIN) return null;
  if (!orgService) return { kind: 'own', userId: reader.userId };
  try {
    const ctx = await orgService.getUserOrgContext(reader.userId);
    return ctx ? { kind: 'org', orgId: ctx.orgId } : { kind: 'own', userId: reader.userId };
  } catch {
    return { kind: 'own', userId: reader.userId };
  }
}

/**
 * `WHERE` fragment for the scope, or `null` when there is nothing to add.
 *
 * The `org` branch deliberately reuses the existing `org_members` join shape instead of adding an
 * `org_id` column to the audit row: audit rows are written on paths that may have no organisation
 * (headless, governance bridge, flow nodes), and inventing a column would mean backfilling a
 * dimension the record never had.
 *
 * 范围用的 `WHERE` 片段；没有可加的约束时为 `null`。
 *
 * `org` 分支**有意复用**既有的 `org_members` 联接形状，而不是给审计行加一个 `org_id` 列：审计行
 * 由若干可能根本没有组织的路径写入（headless / 治理桥 / 流程节点），加列等于给记录补一个它从未
 * 有过的维度。
 */
export function auditScopeSql(scope: AuditRowScope): { sql: string; params: Record<string, unknown> } | null {
  if (!scope) return null;
  if (scope.kind === 'org') {
    return {
      sql: 'CAST(log.userId AS INTEGER) IN (SELECT user_id FROM org_members WHERE org_id = :readerOrgId)',
      params: { readerOrgId: scope.orgId },
    };
  }
  return { sql: 'log.userId = :readerUserId', params: { readerUserId: String(scope.userId) } };
}

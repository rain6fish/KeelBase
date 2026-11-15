// SPDX-License-Identifier: Apache-2.0

/**
 * The single predicate for "may this subject use this tool", shared by the exposure surface
 * (`ToolExposureService.buildToolDefs`) and the execution gate (`ToolGateService.assertToolAllowed`).
 *
 * It is pure: no I/O, no throwing, no metrics. Callers resolve the facts (role, feature-flag state,
 * governance policy, risk level, email verification) and this decides in a fixed order:
 * R5 block → policy disabled → role allow-list → feature flag → adminOnly → verified email.
 *
 * The gate maps the denial code to its existing message, `AuthorizationCheck`, denial cause and
 * refusal counter; the exposure surface reads only `allowed` to decide whether the schema is sent
 * to the model at all. Before this predicate existed both sides implemented the same rules twice,
 * and the exposure side had no feature-flag check — a tool whose feature flag was off was still
 * described to the model and only refused at execution time.
 *
 * 「这个主体能不能用这个工具」的**单一判据**，由可见面（`ToolExposureService.buildToolDefs`）与
 * 执行门（`ToolGateService.assertToolAllowed`）共用。
 *
 * 它是纯函数：不做 I/O、不抛错、不计数。调用方解析事实（角色、特性开关、治理策略、风险级、邮箱
 * 验证），这里按固定顺序判定：R5 阻断 → 策略禁用 → 角色白名单 → 特性开关 → adminOnly → 邮箱验证。
 *
 * 门把拒绝码换成既有的消息、`AuthorizationCheck`、拒绝原因与拒绝计数；可见面只取 `allowed`，
 * 决定这份 schema 是否下发给模型。此前两侧各写了一遍同一套规则，而可见面漏了特性开关 ——
 * 开关关闭的工具仍被描述给模型，直到执行时才被拒。
 */
import { UserRole } from '../../common/entities/user.entity';
import type { ToolPermissions, ToolRiskLevel } from '../interfaces/tool.interface';

export type ToolAccessDenial =
  | 'risk_r5'
  | 'tool_disabled'
  | 'role_denied'
  | 'feature_disabled'
  | 'admin_only'
  | 'email_verified';

export interface ToolAccessFacts {
  /** Caller identity. `'0'` is the trusted in-process system account (privileged sentinel). */
  userId: string;
  /** Caller role resolved from `UsersService`; `undefined` when the identity cannot be resolved. */
  role?: string;
  /** The tool's declared permissions; `undefined` for externally discovered tools. */
  permissions?: ToolPermissions;
  /** Effective risk level; `undefined` when it cannot be determined (e.g. external tools). */
  riskLevel?: ToolRiskLevel;
  /** Governance policy `enabled`; `undefined` when no policy service is wired (unrestricted). */
  policyEnabled?: boolean;
  /** Governance policy role allow-list; empty or `undefined` means unrestricted. */
  policyAllowedRoles?: string[];
  /** Feature-flag state; `undefined` when it cannot be evaluated (no service or no flag declared). */
  featureFlagEnabled?: boolean;
  /** Email verification state; `undefined` when it cannot be resolved (no user row or no service). */
  emailVerified?: boolean;
}

export type ToolAccessDecision =
  | { allowed: true }
  | { allowed: false; denial: ToolAccessDenial };

export function decideToolAccess(facts: ToolAccessFacts): ToolAccessDecision {
  // R5（不可逆/外部动作）对任何主体都阻断，先于其余判据。
  if (facts.riskLevel === 'R5') return { allowed: false, denial: 'risk_r5' };

  // 治理策略开关：与主体无关；未装配策略服务时为 `undefined`（不约束）。
  if (facts.policyEnabled === false) return { allowed: false, denial: 'tool_disabled' };

  // 特权哨兵跳过全部主体判据（只由受信进程内入口产生，见 docs/authorization-architecture.md §3 L1）。
  // 与主体无关的两条（R5 / 策略开关）在它之前，仍然生效。
  if (facts.userId !== '0') {
    const allowedRoles = facts.policyAllowedRoles ?? [];
    if (allowedRoles.length > 0 && (!facts.role || !allowedRoles.includes(facts.role))) {
      return { allowed: false, denial: 'role_denied' };
    }
  }

  const perms = facts.permissions;

  if (perms?.featureFlag && facts.featureFlagEnabled === false) {
    return { allowed: false, denial: 'feature_disabled' };
  }

  if (facts.userId !== '0') {
    if (perms?.adminOnly && facts.role !== UserRole.ADMIN) {
      return { allowed: false, denial: 'admin_only' };
    }
    // 未知身份（`emailVerified` 为 `undefined`）不在此拒 —— 与执行门既有行为一致：
    // 邮箱验证这条只在明确读到未验证时生效，身份缺失由上面的角色/adminOnly 判据处理。
    if (
      perms?.requireVerifiedEmail &&
      facts.emailVerified === false &&
      facts.role !== UserRole.ADMIN
    ) {
      return { allowed: false, denial: 'email_verified' };
    }
  }

  return { allowed: true };
}

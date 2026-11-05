// SPDX-License-Identifier: Apache-2.0

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { PoliciesGuard } from '../../common/casl/policies.guard';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import { UserRole } from '../../common/entities/user.entity';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * The evidence-package export returns the whole hashed chain with per-row payloads, so it cannot be
 * narrowed without ceasing to be a verification. Keeping it on `manage all` is what stops an audit
 * reader — who holds `read AuditLog` — from reading every organisation's payloads. These readings run
 * the real decorator metadata through the real guard and the real abilities, so a drift on either
 * side (the controller's predicate or the role's grant) turn red.
 *
 * The report half of the same pair stays open to the reader: it is the surface that is scoped, and it
 * is the one the auditor's work uses. Pinning both here states where the line is, not just that some
 * policy exists.
 *
 * 证据包导出返回整条已入链的记录与逐行载荷，收窄它就不再是校验。让它留在 `manage all` 上，正是
 * 拦住持有 `read AuditLog` 的审计读者读取每个组织载荷的原因。下面的读数用**真实装饰器元数据**跑
 * **真实守卫与真实能力**，故任一侧面（控制器的判据或角色的授予）漂移都会红。
 *
 * 同一对里的报表那一半对读者保持开放：它是按范围收窄的那一面，也是审计工作的那一面。两处一起钉住，
 * 说的是界限在哪里，而不只是「存在一条策略」。
 */
describe('AuditController · evidence-package export gate', () => {
  const guard = new PoliciesGuard(new Reflector(), new CaslAbilityFactory());

  const payloadFor = (role: UserRole): JwtPayload =>
    ({ sub: 7, username: `who-${role}`, role }) as JwtPayload;

  const reaches = async (method: string, role: UserRole): Promise<boolean> => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: payloadFor(role) }) }),
      getHandler: () => (AuditController.prototype as unknown as Record<string, unknown>)[method],
      getClass: () => AuditController,
    } as unknown as ExecutionContext;
    try {
      return await guard.canActivate(context);
    } catch (err) {
      if (err instanceof ForbiddenException) return false;
      throw err;
    }
  };

  it('export is administrator-only — the audit reader and a plain user get 403', async () => {
    expect(await reaches('getActionReportExport', UserRole.ADMIN)).toBe(true);
    expect(await reaches('getActionReportExport', UserRole.AUDITOR)).toBe(false);
    expect(await reaches('getActionReportExport', UserRole.USER)).toBe(false);
  });

  it('the scoped report stays reachable by the audit reader', async () => {
    expect(await reaches('getActionReport', UserRole.AUDITOR)).toBe(true);
    expect(await reaches('getActionReport', UserRole.ADMIN)).toBe(true);
    expect(await reaches('getActionReport', UserRole.USER)).toBe(false);
  });
});

// SPDX-License-Identifier: Apache-2.0

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OperationAuditController } from './operation-audit.controller';
import { OperationAuditService } from './operation-audit.service';
import { AdminController } from '../admin/admin.controller';
import { CHECK_POLICIES_KEY } from '../common/casl/check-policies.decorator';
import { PoliciesGuard } from '../common/casl/policies.guard';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import {
  BUILTIN_ROLE_RULES,
  RoleRuleSource,
  type RoleRuleSeed,
} from '../common/casl/builtin-role-rules';
import { UserRole } from '../common/entities/user.entity';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * The operations audit is the TS half of the alignment JV-63 made on the Java side: an audit reader
 * reads it without being an administrator. These readings run the real decorator metadata through the
 * real guard and the real abilities (not stubs), so a drift in either the controller's subject or the
 * role's grant fails here.
 *
 * The reverse case is the load-bearing one: with the grant removed, the very same guard must return
 * 403, and adding it back restores access. That proves the grant is what opens the door — not some
 * other rule that happens to imply it.
 *
 * 操作审计是 Java 侧 `JV-63` 所做对齐的 TS 那一半：审计读者**不必是管理员**就能读它。下面的读数用
 * **真实的装饰器元数据**跑**真实的守卫与真实的能力**（不是替身），故控制器判据或角色授予任一侧漂移，
 * 这里都会红。
 *
 * **反向**那条最要紧：撤掉授予后同一个守卫必须返回 403，放回则恢复。这证明开门的就是这条授予 ——
 * 不是别的规则碰巧蕴含了它。
 */
describe('OperationAuditController', () => {
  let controller: OperationAuditController;
  let auditService: Record<string, jest.Mock>;

  beforeEach(() => {
    auditService = Object.fromEntries(['getLogs', 'verifyChain', 'getStats'].map((m) => [m, jest.fn()]));
    controller = new OperationAuditController(auditService as unknown as OperationAuditService);
  });

  it('日志列表委托 service（参数解析）', async () => {
    auditService.getLogs.mockResolvedValue({ items: [], total: 0 });
    await expect(controller.logs(1, 20, '5', '2026-08-01T00:00:00Z')).resolves.toEqual({ items: [], total: 0 });
    expect(auditService.getLogs).toHaveBeenCalledWith(1, 20, 5, new Date('2026-08-01T00:00:00Z'));

    await controller.logs(2, 10, undefined, undefined);
    expect(auditService.getLogs).toHaveBeenLastCalledWith(2, 10, undefined, undefined);
  });

  it('哈希链校验委托 service', async () => {
    auditService.verifyChain.mockResolvedValue({ valid: true });
    await expect(controller.verify()).resolves.toEqual({ valid: true });
    expect(auditService.verifyChain).toHaveBeenCalled();
  });

  it('统计委托 service', async () => {
    auditService.getStats.mockResolvedValue({ create_event: 3 });
    await expect(controller.stats()).resolves.toEqual({ create_event: 3 });
    expect(auditService.getStats).toHaveBeenCalled();
  });

  // The three reads widened by this change. `logs` is the listing, `verify` recomputes the hash chain
  // and `stats` aggregates the same rows — all reads, none with a side effect.
  // 本次放宽的三个读端点。`logs` 是列表、`verify` 重算哈希链、`stats` 聚合同一批行 —— 都是读，
  // 都没有副作用。
  const ENDPOINTS = ['logs', 'verify', 'stats'] as const;

  it('全部端点声明 `read OperationAudit` 策略（不是 `manage all`）', () => {
    // An ability that only grants the intended capability must satisfy every handler; one that only
    // holds `manage all` (the old gate) must not. This pins subject + action, not just "some policy".
    // 只持有目标能力的 ability 必须让每个处理器通过；只持有 `manage all`（旧判据）的必须不通过。
    // 这钉住的是 subject + action，而不只是「有一条策略」。
    const intended = { can: jest.fn((a: string, r: string) => a === 'read' && r === 'OperationAudit') };
    const oldGate = { can: jest.fn((a: string, r: string) => a === 'manage' && r === 'all') };
    const proto = OperationAuditController.prototype as any;
    let count = 0;
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === 'constructor') continue;
      const handlers = Reflect.getMetadata(CHECK_POLICIES_KEY, proto[method]);
      if (!handlers) continue;
      count++;
      for (const h of handlers) {
        expect(h(intended)).toBe(true);
        expect(h(oldGate)).toBe(false);
      }
    }
    expect(count).toBe(3);
  });

  const factory = new CaslAbilityFactory();
  const guardFor = (f: CaslAbilityFactory) => new PoliciesGuard(new Reflector(), f);
  const guard = guardFor(factory);

  const payloadFor = (role: UserRole): JwtPayload =>
    ({ sub: 7, username: `who-${role}`, role }) as JwtPayload;

  /** Returns the guard's verdict for one handler: true = allowed (200-class), false = 403. */
  const reaches = async (
    g: PoliciesGuard,
    target: any,
    method: string,
    role: UserRole,
  ): Promise<boolean> => {
    const request: Record<string, unknown> = { user: payloadFor(role) };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => (target.prototype as Record<string, unknown>)[method],
      getClass: () => target,
    } as unknown as ExecutionContext;
    try {
      return await g.canActivate(context);
    } catch (err) {
      if (err instanceof ForbiddenException) return false;
      throw err;
    }
  };

  const reachesAudit = (method: string, role: UserRole) =>
    reaches(guard, OperationAuditController, method, role);

  it.each(ENDPOINTS)('%s: auditor allowed / ordinary user 403 / admin allowed', async (method) => {
    expect(await reachesAudit(method, UserRole.AUDITOR)).toBe(true);
    expect(await reachesAudit(method, UserRole.USER)).toBe(false);
    expect(await reachesAudit(method, UserRole.ADMIN)).toBe(true);
  });

  it('auditor 只读：OperationAudit 上读以外的动作一律不许', () => {
    const ability = factory.createForUser(payloadFor(UserRole.AUDITOR));
    expect(ability.can('read', 'OperationAudit')).toBe(true);
    for (const action of ['create', 'update', 'delete', 'manage'] as const) {
      expect(ability.can(action, 'OperationAudit')).toBe(false);
    }
  });

  /**
   * Reverse proof: a rule source that hands the auditor every builtin rule except the operations
   * audit grant must make the same guard refuse. The unmodified rule source then restores access.
   *
   * 反向取证：一个把审计读者的内置规则**除操作审计授予以外**全给的规则源，必须让同一个守卫拒绝；
   * 未改动的规则源随即恢复访问。
   */
  it('反向可证：撤掉 `OperationAudit` 授予 ⇒ auditor 转 403；放回 ⇒ 恢复', async () => {
    const withoutGrant = (subjectToDrop: string): RoleRuleSource =>
      ({
        rulesFor: (roleCode: string): RoleRuleSeed[] =>
          BUILTIN_ROLE_RULES.filter(
            (r) => r.roleCode === roleCode && r.subject !== subjectToDrop,
          ),
        dataScopeFor: () => undefined,
        customDeptIdsFor: () => null,
      }) as unknown as RoleRuleSource;

    const revokedGuard = guardFor(new CaslAbilityFactory(withoutGrant('OperationAudit')));
    for (const method of ENDPOINTS) {
      expect(await reaches(revokedGuard, OperationAuditController, method, UserRole.AUDITOR)).toBe(
        false,
      );
    }
    for (const method of ENDPOINTS) {
      expect(await reachesAudit(method, UserRole.AUDITOR)).toBe(true);
    }
  });

  /**
   * Operator surfaces stay closed. The audit reader gained one read face, not the admin console: the
   * behavior-alert list and its acknowledge action still require `manage all`, so the auditor cannot
   * act on the operational record it reviews.
   *
   * 运营面保持关闭。审计读者只多了一个读面，不是管理台：异常行为告警列表与其「标记已处理」仍要求
   * `manage all`，故审计读者不能对它复核的运营记录动手。
   */
  it.each(['behaviorAlerts', 'acknowledgeBehaviorAlert'])(
    '运营面 %s：auditor 仍 403（admin 不受影响）',
    async (method) => {
      expect(await reaches(guard, AdminController, method, UserRole.AUDITOR)).toBe(false);
      expect(await reaches(guard, AdminController, method, UserRole.ADMIN)).toBe(true);
    },
  );
});

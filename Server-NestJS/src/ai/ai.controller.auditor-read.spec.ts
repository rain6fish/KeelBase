// SPDX-License-Identifier: Apache-2.0

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AiController } from './ai.controller';
import { PoliciesGuard } from '../common/casl/policies.guard';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { UserRole } from '../common/entities/user.entity';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * AW-2's second half, measured the way the first half was: route by route, on the real decorator
 * metadata and the real abilities — not on stubs. For every surface this change opens the paired
 * reading is `auditor` allowed / ordinary `user` denied / `admin` allowed. For every write or decision
 * door next to those reads, the auditor must stay denied; that half is the point of the role.
 *
 * The `admin` leg is not incidental: `manage all` implies `read` on any subject, so if a decorator
 * ever drifts to a subject the admin rule does not cover, the widening would have locked the operator
 * out too.
 *
 * AW-2 第二半，按与第一半相同的方式度量：逐条路由，跑**真实的装饰器元数据 + 真实的能力**，
 * 而不是替身。本轮开放的每一面，配对读数都是 `auditor` 通过 / 普通 `user` 拒绝 / `admin` 通过。
 * 读端点旁边的每一道写或裁决门，审计读者都必须继续被拒 —— 这一半正是这个角色的意义所在。
 *
 * `admin` 那一条不是陪衬：`manage all` 蕴含任意主体上的 `read`，所以判据若漂到管理员规则覆盖不到的
 * 主体上，这次放宽就会把操作者本人也一并锁在外面。
 */
describe('AiController · auditor read surfaces (AW-2 second half)', () => {
  const factory = new CaslAbilityFactory();
  // Real Reflector + real metadata: this exercises decorator → guard, not a hand-copied handler.
  // 真实 Reflector + 真实元数据：跑的是「装饰器 → 守卫」，不是手抄的处理器。
  const guard = new PoliciesGuard(new Reflector(), factory);

  const payloadFor = (role: UserRole): JwtPayload =>
    ({ sub: 7, username: `who-${role}`, role }) as JwtPayload;

  /** Returns the guard's verdict: true = 200-class, false = 403. */
  const reaches = async (method: string, role: UserRole): Promise<boolean> => {
    const request: Record<string, unknown> = { user: payloadFor(role) };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => (AiController.prototype as unknown as Record<string, unknown>)[method],
      getClass: () => AiController,
    } as unknown as ExecutionContext;
    try {
      return await guard.canActivate(context);
    } catch (err) {
      if (err instanceof ForbiddenException) return false;
      throw err;
    }
  };

  const OPENED: Array<[string, string]> = [
    ['getGovernancePolicy', 'GET /ai/governance/policy'],
    ['getPolicyHistory', 'GET /ai/governance/policy/history'],
    ['getPolicyHistoryRevision', 'GET /ai/governance/policy/history/:revision'],
    ['getTools', 'GET /ai/tools'],
    ['pendingApprovals', 'GET /ai/confirmations/pending'],
    ['decidedApprovals', 'GET /ai/confirmations/decided'],
  ];

  it.each(OPENED)('%s (%s): auditor 200 / user 403 / admin 200', async (method) => {
    expect(await reaches(method, UserRole.AUDITOR)).toBe(true);
    expect(await reaches(method, UserRole.USER)).toBe(false);
    expect(await reaches(method, UserRole.ADMIN)).toBe(true);
  });

  /**
   * Deliberately left closed. The two writes and the two decision doors sit right next to the reads
   * above and must keep failing for an auditor — if any of these ever flips, the role has gained the
   * ability to rule on what it reviews. `getPolicyPresets` is a read, but its only consumer is
   * `apply-preset`, so it was not part of this widening and is pinned closed until someone decides
   * otherwise on its own merits.
   *
   * 有意保持关闭。两道写门与两道裁决门就紧挨着上面的读端点，对审计读者必须继续失败 —— 其中任何一道
   * 一旦翻转，这个角色就获得了裁决它本应复核之物的能力。`getPolicyPresets` 是读端点，但它唯一的消费者
   * 就是 `apply-preset`，故不在本轮放宽内，钉死关闭，待日后单独就事论事再定。
   */
  const STILL_CLOSED: Array<[string, string]> = [
    ['setGovernancePolicy', 'PUT /ai/governance/policy'],
    ['getPolicyPresets', 'GET /ai/governance/policy/presets'],
    ['applyPolicyPreset', 'POST /ai/governance/policy/apply-preset'],
    ['decideApproval', 'POST /ai/confirmations/:token/approve-by'],
    ['retryApprovalExecution', 'POST /ai/confirmations/:token/retry-execution'],
  ];

  it.each(STILL_CLOSED)('%s (%s): auditor still 403 (admin unaffected)', async (method) => {
    expect(await reaches(method, UserRole.AUDITOR)).toBe(false);
    expect(await reaches(method, UserRole.ADMIN)).toBe(true);
  });
});

// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiAuditLog } from '../entities/ai-audit-log.entity';
import { AiConfirmationRequest } from '../entities/ai-confirmation-request.entity';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from '../entities/ai-write-claim.entity';
import { checkAuditReachability, type ReachabilityRepos } from './audit-reachability';

/**
 * AW-11 criterion #6: the batch checker reports **which row types cannot be reached** — a list, never
 * a resolution rate. Each case below pins one of the required semantics, and the batch case pins that
 * linked and unlinked rows are counted independently rather than averaged.
 *
 * AW-11 判据 #6：批量检查报告的是**哪些 row type 走不到** —— 一份清单，绝不是解析率。下面每个用例钉住
 * 一条要求的语义；批量用例钉住「可达与不可达各行分别计数，而不是被平均掉」。
 */
describe('AW-11 判据 #6：图级正向可达性（输出不可达清单）', () => {
  let ds: DataSource;
  let repos: ReachabilityRepos;
  let seq = 0;

  const auditRepo = () => ds.getRepository(AiAuditLog);
  const claimRepo = () => ds.getRepository(AiWriteClaim);
  const effectRepo = () => ds.getRepository(AiToolSideEffect);
  const confirmationRepo = () => ds.getRepository(AiConfirmationRequest);

  const seedAudit = (writeClaimId?: number | null): Promise<AiAuditLog> =>
    auditRepo().save(
      auditRepo().create({
        userId: 'u-alice',
        conversationId: 'conv-1',
        action: 'tool_call',
        isError: false,
        writeClaimId,
      }),
    );

  const seedClaim = (over: Partial<AiWriteClaim> = {}): Promise<AiWriteClaim> =>
    claimRepo().save(
      claimRepo().create({
        idempotencyKey: `claim-key-${++seq}`,
        userId: 'u-alice',
        conversationId: 'conv-1',
        toolName: 'create_followup',
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.SETTLED,
        claimedAt: new Date(),
        attempts: 1,
        ...over,
      }),
    );

  const seedEffect = (): Promise<AiToolSideEffect> =>
    effectRepo().save(
      effectRepo().create({
        idempotencyKey: `effect-key-${++seq}`,
        userId: 'u-alice',
        conversationId: 'conv-1',
        toolName: 'create_followup',
        argsHash: 'h',
        resultType: 'crm_task',
        resultId: 10,
      }),
    );

  const seedConfirmation = (token: string): Promise<AiConfirmationRequest> =>
    confirmationRepo().save(
      confirmationRepo().create({
        token,
        toolName: 'create_followup',
        args: '{}',
        operatorId: 'u-alice',
        riskLevel: 'R3',
        status: 'approved',
      }),
    );

  /** A fully linked record: audit → claim → effect + confirmation. */
  const linked = async (token: string): Promise<{ audit: AiAuditLog; claim: AiWriteClaim; effect: AiToolSideEffect }> => {
    const effect = await seedEffect();
    await seedConfirmation(token);
    const claim = await seedClaim({ effectId: effect.id, authorizationRef: token });
    const audit = await seedAudit(claim.id);
    return { audit, claim, effect };
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiAuditLog, AiWriteClaim, AiToolSideEffect, AiConfirmationRequest],
      synchronize: true,
    });
    await ds.initialize();
    repos = {
      auditLogs: auditRepo(),
      claims: claimRepo(),
      effects: effectRepo(),
      confirmations: confirmationRepo(),
    };
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('全可达 ⇒ `unreachable` 为空清单；输出形状里没有解析率', async () => {
    const { audit } = await linked('tok-1');

    const report = await checkAuditReachability([audit.id], repos);

    expect(report).toEqual({ checked: 1, unreachable: [], notApplicable: [] });
    // The key output is a list. A rate/percentage would let a broken graph read as healthy.
    // 关键输出是清单。解析率会让断掉的图被读成健康。
    expect(Object.keys(report).sort()).toEqual(['checked', 'notApplicable', 'unreachable']);
  });

  it('历史行没有 `write_claim_id` ⇒ `claim` 不可达（即使反着有一条 claim.audit_row_id 也不拿来配对）', async () => {
    // Record #27's shape: the claim exists but names no audit row, and the audit row has no forward edge.
    // 本记录 #27 的形态：占位行存在但不指审计行，而审计行没有正向边。
    await seedClaim();
    const audit = await seedAudit(null);

    const report = await checkAuditReachability([audit.id], repos);

    expect(report).toEqual({
      checked: 1,
      unreachable: [
        { rowType: 'claim', count: 1, reasons: ['no_write_claim_id'] },
        { rowType: 'effect', count: 1, reasons: ['claim_unreachable'] },
        { rowType: 'confirmation', count: 1, reasons: ['claim_unreachable'] },
      ],
      notApplicable: [],
    });
    // A blocked claim must not silently omit the downstream row types — listing only `claim` would
    // read as "effect and confirmation were fine".
    // 占位被阻断时**绝不能默默省略**下游 row type —— 只列 `claim` 会被读成「副作用与确认都没问题」。
    expect(report.unreachable.map((gap) => gap.rowType)).toEqual(['claim', 'effect', 'confirmation']);
  });

  it('`write_claim_id` 指向不存在的占位行 ⇒ `claim` 不可达（claim_missing），下游同样级联', async () => {
    const audit = await seedAudit(999_999);

    const report = await checkAuditReachability([audit.id], repos);

    expect(report).toEqual({
      checked: 1,
      unreachable: [
        { rowType: 'claim', count: 1, reasons: ['claim_missing'] },
        { rowType: 'effect', count: 1, reasons: ['claim_unreachable'] },
        { rowType: 'confirmation', count: 1, reasons: ['claim_unreachable'] },
      ],
      notApplicable: [],
    });
  });

  it('审计行本身不存在 ⇒ `claim` 不可达（audit_row_missing），下游同样级联', async () => {
    const report = await checkAuditReachability([999_999], repos);

    expect(report).toEqual({
      checked: 1,
      unreachable: [
        { rowType: 'claim', count: 1, reasons: ['audit_row_missing'] },
        { rowType: 'effect', count: 1, reasons: ['claim_unreachable'] },
        { rowType: 'confirmation', count: 1, reasons: ['claim_unreachable'] },
      ],
      notApplicable: [],
    });
  });

  it('dry-run（`effectId: null`）⇒ `effect` **不适用**，不算不可达', async () => {
    const claim = await seedClaim({ effectId: null, authorizationRef: 'tok-1' });
    await seedConfirmation('tok-1');
    const audit = await seedAudit(claim.id);

    const report = await checkAuditReachability([audit.id], repos);

    expect(report).toEqual({
      checked: 1,
      unreachable: [],
      notApplicable: [{ rowType: 'effect', count: 1 }],
    });
  });

  it('自动写（`authorizationRef: null`）⇒ `confirmation` **不适用**，不算不可达', async () => {
    const effect = await seedEffect();
    const claim = await seedClaim({ effectId: effect.id, authorizationRef: null });
    const audit = await seedAudit(claim.id);

    const report = await checkAuditReachability([audit.id], repos);

    expect(report).toEqual({
      checked: 1,
      unreachable: [],
      notApplicable: [{ rowType: 'confirmation', count: 1 }],
    });
  });

  it('`authorizationRef` 指向不存在的确认行 ⇒ `confirmation` 不可达（confirmation_missing）', async () => {
    const claim = await seedClaim({ effectId: null, authorizationRef: 'tok-missing' });
    const audit = await seedAudit(claim.id);

    const report = await checkAuditReachability([audit.id], repos);

    expect(report).toEqual({
      checked: 1,
      unreachable: [{ rowType: 'confirmation', count: 1, reasons: ['confirmation_missing'] }],
      notApplicable: [{ rowType: 'effect', count: 1 }],
    });
  });

  it('`effectId` 指向不存在的副作用行 ⇒ `effect` 不可达（effect_missing）', async () => {
    const claim = await seedClaim({ effectId: 999_999, authorizationRef: null });
    const audit = await seedAudit(claim.id);

    const report = await checkAuditReachability([audit.id], repos);

    expect(report).toEqual({
      checked: 1,
      unreachable: [{ rowType: 'effect', count: 1, reasons: ['effect_missing'] }],
      notApplicable: [{ rowType: 'confirmation', count: 1 }],
    });
  });

  it('批量混排：可达、级联与单点缺口分别计数，清单按 claim → effect → confirmation 排列', async () => {
    const { audit: goodAudit } = await linked('tok-ok');
    const historyAudit = await seedAudit(null);
    const missingConfirmClaim = await seedClaim({ effectId: null, authorizationRef: 'tok-missing' });
    const missingConfirmAudit = await seedAudit(missingConfirmClaim.id);

    const report = await checkAuditReachability(
      [goodAudit.id, historyAudit.id, missingConfirmAudit.id],
      repos,
    );

    expect(report.checked).toBe(3);
    expect(report.unreachable).toEqual([
      { rowType: 'claim', count: 1, reasons: ['no_write_claim_id'] },
      // The blocked claim cascades: its downstream types are unreachable, not "fine".
      // 被阻断的占位行会级联：它的下游 row type 不可达，而不是「没问题」。
      { rowType: 'effect', count: 1, reasons: ['claim_unreachable'] },
      { rowType: 'confirmation', count: 2, reasons: ['claim_unreachable', 'confirmation_missing'] },
    ]);
    // The third record has no effect id, so its effect is "not applicable" — a separate fact from
    // the gaps above, and never folded into them. The blocked record adds no `notApplicable` count:
    // whether its downstream rows would have applied is unknowable.
    // 第三条没有副作用 id，故其 effect 记为「不适用」—— 与上面的缺口是**不同的事实**，绝不并入。
    // 被阻断的那条不增加 `notApplicable`：它下游本是否会适用无法得知。
    expect(report.notApplicable).toEqual([{ rowType: 'effect', count: 1 }]);
  });

  it('重复 id 只计一次（按集合检查）', async () => {
    const { audit } = await linked('tok-1');

    const report = await checkAuditReachability([audit.id, audit.id], repos);

    expect(report.checked).toBe(1);
    expect(report.unreachable).toEqual([]);
  });
});

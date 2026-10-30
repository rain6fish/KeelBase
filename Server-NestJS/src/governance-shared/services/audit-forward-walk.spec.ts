// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiAuditLog } from '../entities/ai-audit-log.entity';
import { AiConfirmationRequest } from '../entities/ai-confirmation-request.entity';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from '../entities/ai-write-claim.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { forwardWalkFromAuditRow, type ForwardWalkRepos } from './audit-forward-walk';
import { buildKey } from './effect-shared';

/**
 * AW-11 acceptance: a forward walk that starts at the audit row reaches claim → effect and
 * confirmation for a newly linked record; a historical row without the edge reports `unlinked` and is
 * never paired by guessing.
 *
 * The link is written by the real `attachAuditRow` (not a hand-set column), so this fixture also
 * covers the Shape A write path end to end.
 *
 * AW-11 验收：从审计行出发的正向走，对一条新挂链的记录能到占位行 → 副作用与确认行；没有这条边的历史行
 * 报 `unlinked`，且绝不靠猜配对。
 *
 * 链接由真实的 `attachAuditRow` 写下（不是手工塞列），故本夹具同时覆盖形状 A 的写路径。
 */
const CTX = {
  userId: 'u-alice',
  conversationId: 'conv-1',
  toolName: 'create_followup',
  args: { customerId: 7, title: '跟进' },
};

describe('AW-11 正向可达：audit → claim → effect / confirmation', () => {
  let ds: DataSource;
  let services: {
    auditLogs: ForwardWalkRepos['auditLogs'];
    claims: ForwardWalkRepos['claims'];
    effects: NonNullable<ForwardWalkRepos['effects']>;
    confirmations: NonNullable<ForwardWalkRepos['confirmations']>;
  };
  let store: AiToolEffectsService;

  const seedAudit = (): Promise<AiAuditLog> =>
    services.auditLogs.save(
      services.auditLogs.create({
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        action: 'tool_call',
        isError: false,
      }),
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiAuditLog, AiWriteClaim, AiToolSideEffect, AiConfirmationRequest],
      synchronize: true,
    });
    await ds.initialize();
    services = {
      auditLogs: ds.getRepository(AiAuditLog),
      claims: ds.getRepository(AiWriteClaim),
      effects: ds.getRepository(AiToolSideEffect),
      confirmations: ds.getRepository(AiConfirmationRequest),
    };
    // Positional assembly: `dataSource` is 7th, `claimsRepo` 11th (same shape as write-claim.spec).
    // 位置式装配：`dataSource` 在第 7 位、`claimsRepo` 在第 11 位（与 write-claim.spec 同一种装配）。
    store = new AiToolEffectsService(
      services.effects,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ds,
      undefined,
      undefined,
      undefined,
      services.claims,
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('新挂链记录：audit → claim → effect 与 confirmation', async () => {
    const confirmation = await services.confirmations.save(
      services.confirmations.create({
        token: 'tok-1',
        toolName: CTX.toolName,
        args: JSON.stringify(CTX.args),
        operatorId: CTX.userId,
        riskLevel: 'R3',
        status: 'approved',
      }),
    );
    const effect = await services.effects.save(
      services.effects.create({
        idempotencyKey: buildKey(CTX),
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsHash: 'h',
        resultType: 'crm_task',
        resultId: 10,
      }),
    );
    const claim = await services.claims.save(
      services.claims.create({
        idempotencyKey: buildKey(CTX),
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.SETTLED,
        claimedAt: new Date(),
        attempts: 1,
        effectId: effect.id,
        authorizationRef: confirmation.token,
      }),
    );
    const audit = await seedAudit();

    // The real write path: the audit row's forward edge and the claim's audit_row_id land as a pair.
    // 真实写路径：审计行的正向边与占位行的 audit_row_id 成对落。
    await store.attachAuditRow(
      {
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsJson: JSON.stringify(CTX.args),
      },
      audit.id,
    );

    const walk = await forwardWalkFromAuditRow(audit.id, services);
    expect(walk.state).toBe('linked');
    if (walk.state !== 'linked') return;
    expect(walk.claim.id).toBe(claim.id);
    expect(walk.effect?.id).toBe(effect.id);
    expect(walk.confirmation?.token).toBe('tok-1');
  });

  it('B1 + 正向走：失败后在新确认下重试成功 ⇒ 读者读到的是**执行那次**的确认，不是旧 token', async () => {
    // Two confirmations for the same tool/args (criterion 5): the reader must resolve the one that
    // actually executed, by following the claim rather than by picking a token itself.
    // 同工具、同参数的两条确认（判据 5）：读者要拿到**实际执行**的那一条 —— 靠沿占位行走，
    // 而不是自己去挑一个 token。
    for (const token of ['tok-old', 'tok-new']) {
      await services.confirmations.save(
        services.confirmations.create({
          token,
          toolName: CTX.toolName,
          args: JSON.stringify(CTX.args),
          operatorId: CTX.userId,
          riskLevel: 'R3',
          status: 'approved',
        }),
      );
    }
    const effect = await services.effects.save(
      services.effects.create({
        idempotencyKey: buildKey(CTX),
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsHash: 'h',
        resultType: 'crm_task',
        resultId: 10,
      }),
    );
    await services.claims.save(
      services.claims.create({
        idempotencyKey: buildKey(CTX),
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.RELEASED,
        claimedAt: new Date(),
        attempts: 1,
        effectId: effect.id,
        authorizationRef: 'tok-old',
      }),
    );
    const audit = await seedAudit();

    // Retry under the second confirmation, then link the audit row of the successful attempt.
    // 在第二次确认下重试，再挂上成功那次尝试的审计行。
    const retry = await store.claimWrite({ ...CTX, authorizationRef: 'tok-new' });
    expect(retry.won).toBe(true);
    await store.attachAuditRow(
      {
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsJson: JSON.stringify(CTX.args),
      },
      audit.id,
    );

    const walk = await forwardWalkFromAuditRow(audit.id, services);
    expect(walk.state).toBe('linked');
    if (walk.state !== 'linked') return;
    expect(walk.claim.authorizationRef).toBe('tok-new');
    expect(walk.confirmation?.token).toBe('tok-new');
  });

  it('历史行（没有 write_claim_id）：如实 `unlinked`，即使反着有一条 claim.audit_row_id 也不拿来猜', async () => {
    // The shape of record #27: a claim exists with audit_row_id null, and the audit row has no forward edge.
    // 本记录 #27 的形态：claim 存在、audit_row_id 为 null，审计行没有正向边。
    const audit = await seedAudit();
    await services.claims.save(
      services.claims.create({
        idempotencyKey: 'legacy-key',
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.CLAIMED,
        claimedAt: new Date(),
        attempts: 1,
      }),
    );

    const walk = await forwardWalkFromAuditRow(audit.id, services);

    expect(walk).toEqual({ state: 'unlinked', auditRowId: audit.id, reason: 'no_write_claim_id' });
  });

  it('正向边指向的占位行不存在 ⇒ `unlinked`（claim_missing），不返回确定但错误的答案', async () => {
    const audit = await seedAudit();
    await services.auditLogs.update({ id: audit.id }, { writeClaimId: 999_999 });

    const walk = await forwardWalkFromAuditRow(audit.id, services);

    expect(walk).toEqual({ state: 'unlinked', auditRowId: audit.id, reason: 'claim_missing' });
  });
});

// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import type { TargetStatusLookup } from '../../governance-core/target-status';

/**
 * AW-17: reconciling a stuck write claim against the target's status query.
 *
 * A **real** sqlite database is used, not repository doubles: the convergence is a *conditional*
 * update (`WHERE status = 'claimed'`), and "only a row that is still unknown moves" is decided by the
 * database. Testing that against a double would test the double.
 *
 * The two readings this pins, in the item's own words:
 * - a target that answers **converges the ledger** (`executed` → `settled`, `not_executed` →
 *   `released`) and leaves evidence of when / by what query / with what conclusion;
 * - a target that **cannot be asked leaves the ledger `claimed`** (unknown) and records that we asked
 *   and got nothing — never a `not_executed` on silence.
 *
 * AW-17：拿目标的状态查询对账一条卡住的写占位。
 *
 * 用**真的** sqlite，而不是仓储替身：收敛是**条件更新**（`WHERE status = 'claimed'`），「只有仍是未知的
 * 行才会动」由数据库裁决；拿替身测它等于测替身。
 *
 * 本 spec 钉住两个读数，用本项自己的话：
 * - 目标答了 ⇒ **账收敛**（`executed` → `settled`，`not_executed` → `released`），并留下「何时、按什么
 *   查、结论」的证据；
 * - 目标**问不到** ⇒ 账**保持 `claimed`**（未知），并记下「问过、没得到东西」—— 沉默绝不变成
 *   `not_executed`。
 */
const KEY = 'u-alice:conv-1:proxy_create_contract:abc';
const TOOL = 'proxy_create_contract';

const staleClaim = (overrides: Partial<AiWriteClaim> = {}): Partial<AiWriteClaim> => ({
  idempotencyKey: KEY,
  userId: 'u-alice',
  conversationId: 'conv-1',
  toolName: TOOL,
  argsHash: 'abc',
  status: WRITE_CLAIM_STATUS.CLAIMED,
  // Well past the default 60-minute staleness threshold — this is the ledger's `unknown` state.
  claimedAt: new Date(Date.now() - 90 * 60_000),
  attempts: 1,
  ...overrides,
});

const lookup = (overrides: Partial<TargetStatusLookup> = {}): TargetStatusLookup => ({
  queriedAt: '2026-11-05T00:00:00.000Z',
  queryMethod: 'GET',
  queryPath: '/contracts/status/' + KEY,
  conclusion: 'unknown',
  reason: 'target-status-unavailable',
  ...overrides,
});

describe('AW-17 目标状态对账（只读查询收敛 unknown）', () => {
  let ds: DataSource;
  let effects: AiToolEffectsService;
  let probe: { available: jest.Mock; lookup: jest.Mock };

  const claims = () => ds.getRepository(AiWriteClaim);
  const lookups = () => ds.getRepository(TargetStatusLookupRow);

  const build = (probeOrUndefined: boolean = true): void => {
    probe = { available: jest.fn(() => true), lookup: jest.fn() };
    effects = new AiToolEffectsService(
      ds.getRepository(AiToolSideEffect),
      undefined, // revoker
      undefined, // externalRevoker
      undefined, // reporter
      undefined, // auditChain
      undefined, // toolRegistry
      undefined, // dataSource
      undefined, // operationAudit
      undefined, // configService (defaults to the 60-minute threshold)
      undefined, // snapshotCaptor
      claims(), // claimsRepo
      undefined, // comparabilityRepo
      (probeOrUndefined ? probe : undefined) as any, // statusProbe
      lookups(), // lookupsRepo
    );
  };

  const seed = async (): Promise<AiWriteClaim> => claims().save(claims().create(staleClaim()));

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, AiWriteClaim, TargetStatusLookupRow],
      synchronize: true,
    });
    await ds.initialize();
    build();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('目标答「执行过」⇒ 账收敛为 settled，并留下查询证据（何时 / 按什么查 / 结论）', async () => {
    const row = await seed();
    probe.lookup.mockResolvedValue(lookup({ conclusion: 'executed', reason: null }));

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('reconciled');
    expect(r.conclusion).toBe('executed');
    expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.SETTLED);

    const after = await claims().findOne({ where: { id: row.id } });
    expect(after?.status).toBe(WRITE_CLAIM_STATUS.SETTLED);
    expect(after?.settledAt).toBeInstanceOf(Date);
    // No side-effect row is invented: we do not know the target's id, and a made-up one would point a
    // future revoke at the wrong record.
    expect(after?.effectId ?? null).toBeNull();

    // The query carried the **original writer's** identity, not the administrator's.
    expect(probe.lookup).toHaveBeenCalledTimes(1);
    expect(probe.lookup).toHaveBeenCalledWith(TOOL, KEY, 'u-alice');

    const evidence = await lookups().find({ where: { idempotencyKey: KEY } });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      toolName: TOOL,
      lookedUpBy: 'admin-1',
      asUserId: 'u-alice',
      queryMethod: 'GET',
      conclusion: 'executed',
      reason: null,
    });
    expect(evidence[0].queryPath).toContain(KEY);
    expect(evidence[0].at).toBeInstanceOf(Date);
  });

  it('目标答「没执行」⇒ 账收敛为 released（重试的门重新打开），证据记下结论', async () => {
    const row = await seed();
    probe.lookup.mockResolvedValue(lookup({ conclusion: 'not_executed', reason: null }));

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('reconciled');
    expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.RELEASED);

    const after = await claims().findOne({ where: { id: row.id } });
    expect(after?.status).toBe(WRITE_CLAIM_STATUS.RELEASED);
    expect(after?.releaseReason).toBe('target_status_not_executed');

    const evidence = await lookups().find({ where: { idempotencyKey: KEY } });
    expect(evidence[0].conclusion).toBe('not_executed');
  });

  it('**反向对照**：目标不可查 ⇒ 账仍是 claimed（unknown），证据写明「问不到」', async () => {
    const row = await seed();
    probe.lookup.mockResolvedValue(lookup()); // conclusion unknown, reason target-status-unavailable

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('unresolved');
    expect(r.conclusion).toBe('unknown');
    expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.CLAIMED);

    const after = await claims().findOne({ where: { id: row.id } });
    expect(after?.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    expect(after?.settledAt ?? null).toBeNull();

    const evidence = await lookups().find({ where: { idempotencyKey: KEY } });
    expect(evidence[0]).toMatchObject({ conclusion: 'unknown', reason: 'target-status-unavailable' });
  });

  it('没有探针（治理进程 / 降级装配）⇒ 同一条口径：account 不动，unknown，记一条「问不到」', async () => {
    build(false);
    const row = await seed();

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('unresolved');
    expect(r.conclusion).toBe('unknown');
    expect(r.evidence?.reason).toBe('target-status-unavailable');
    const after = await claims().findOne({ where: { id: row.id } });
    expect(after?.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
  });

  it('还没到陈旧阈值 ⇒ 不查（它可能仍在跑），账不动，也不留证据', async () => {
    const row = await claims().save(
      claims().create(staleClaim({ claimedAt: new Date(Date.now() - 5 * 60_000) })),
    );

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('not_stale');
    expect(r.evidence).toBeNull();
    expect(probe.lookup).not.toHaveBeenCalled();
    const after = await claims().findOne({ where: { id: row.id } });
    expect(after?.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    expect(await lookups().count()).toBe(0);
  });

  it('已经落定的占位 ⇒ not_claimable，再查一次也改不好它', async () => {
    const row = await claims().save(
      claims().create(staleClaim({ status: WRITE_CLAIM_STATUS.SETTLED, settledAt: new Date() })),
    );

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('not_claimable');
    expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.SETTLED);
    expect(probe.lookup).not.toHaveBeenCalled();
    expect(await lookups().count()).toBe(0);
  });

  it('人已释放的占位（claimed + closed_unknown）⇒ not_claimable，查询不得覆盖那份决定', async () => {
    // AW-16 F-63 keeps the row `claimed` because the truth is unknown, and records the disposition
    // separately. A later status query is evidence about the target, not a licence to undo a person's
    // decision — so it must not move the ledger, and it must not even ask.
    // AW-16 F-63 让该行保持 `claimed`（真相未知），处置另行记录。后来的状态查询是关于目标的证据，不是
    // 推翻人之决定的许可 —— 故它既不得移动账，也不得去问。
    const row = await claims().save(
      claims().create(
        staleClaim({
          decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
          releaseReason: 'manual_release_unknown',
        }),
      ),
    );
    probe.lookup.mockResolvedValue(lookup({ conclusion: 'executed', reason: null }));

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('not_claimable');
    expect(probe.lookup).not.toHaveBeenCalled();
    const after = await claims().findOne({ where: { id: row.id } });
    expect(after?.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    expect(after?.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
    expect(await lookups().count()).toBe(0);
  });

  it('不存在 ⇒ not_found（不造一条空证据）', async () => {
    const r = await effects.reconcileClaim(9999, 'admin-1');
    expect(r.outcome).toBe('not_found');
    expect(r.evidence).toBeNull();
    expect(await lookups().count()).toBe(0);
  });
});

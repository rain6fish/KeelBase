// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { AiToolEffectsService, SYSTEM_SWEEP_LOOKUP_ACTOR } from './ai-tool-effects.service';
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
  let probe: { available: jest.Mock; canAsk: jest.Mock; lookup: jest.Mock };

  const claims = () => ds.getRepository(AiWriteClaim);
  const lookups = () => ds.getRepository(TargetStatusLookupRow);

  const build = (probeOrUndefined: boolean = true): void => {
    probe = { available: jest.fn(() => true), canAsk: jest.fn(() => true), lookup: jest.fn() };
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

  /**
   * F-79: the hourly sweep's bounded automatic re-ask.
   *
   * The clock is a parameter (`reconcileDueClaims(now)`) and the attempt count is read back from the
   * evidence table, so these cases are the schedule itself seen through the real ledger: when it
   * asks, when it must not, and what "parked" looks like. Convergence is not re-implemented here —
   * it goes through `reconcileClaim`, which the cases above already pin; these assert that the sweep
   * reaches it and records who asked.
   *
   * F-79：每小时清扫的有界自动重问。
   *
   * 时钟是参数（`reconcileDueClaims(now)`），次数从证据表读回，故这些用例就是计划本身透过真账本的样子：
   * 什么时候问、什么时候不许问、「已搁置」长什么样。收敛不在这里重写 —— 它走 `reconcileClaim`，上面
   * 那些用例已经钉过；这里断言清扫真的走到了它、并记下是谁问的。
   */
  describe('reconcileDueClaims（有界自动重问）', () => {
    const base = new Date('2026-11-12T12:00:00.000Z');
    const at = (minutesAgo: number): Date => new Date(base.getTime() - minutesAgo * 60_000);

    /** A hold whose window has ended — the only state the sweep picks up. */
    const seedQueued = (overrides: Partial<AiWriteClaim> = {}): Promise<AiWriteClaim> =>
      claims().save(
        claims().create(
          staleClaim({
            claimedAt: at(61),
            decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
            ...overrides,
          }),
        ),
      );

    /** One evidence row, dated explicitly — `at` is what the schedule anchors on. */
    const seedLookup = async (lookedUpAt: Date, key: string = KEY): Promise<void> => {
      const row = await lookups().save(
        lookups().create({
          idempotencyKey: key,
          toolName: TOOL,
          lookedUpBy: 'admin-1',
          asUserId: 'u-alice',
          queryMethod: 'GET',
          queryPath: '/contracts/status/' + key,
          conclusion: 'unknown',
          reason: 'timeout',
        }),
      );
      await lookups().update(row.id, { at: lookedUpAt });
    };

    it('第一次自动问：进入队列后约 1 小时才问（59 分钟不问，61 分钟问），执行者记 system:sweep', async () => {
      const early = await seedQueued({ claimedAt: at(59) });
      probe.lookup.mockResolvedValue(lookup({ conclusion: 'executed', reason: null }));

      const quiet = await effects.reconcileDueClaims(base);
      expect(quiet.asked).toBe(0);
      expect(quiet.skippedNotDue).toBe(1);
      expect(probe.lookup).not.toHaveBeenCalled();

      // Now past the first interval — and past the staleness threshold, so the guard lets it through.
      await claims().update(early.id, { claimedAt: at(61) });
      const r = await effects.reconcileDueClaims(base);

      expect(r.candidates).toBe(1);
      expect(r.asked).toBe(1);
      expect(r.converged).toBe(1);
      expect(probe.lookup).toHaveBeenCalledWith(TOOL, KEY, 'u-alice');

      const after = await claims().findOne({ where: { id: early.id } });
      expect(after?.status).toBe(WRITE_CLAIM_STATUS.SETTLED);

      const evidence = await lookups().find({ where: { idempotencyKey: KEY } });
      expect(evidence).toHaveLength(1);
      // Who asked and as whom are two facts: the sweep asked, the original writer's identity went out.
      // 谁问的与以谁的身份问是两件事：清扫问的，出去的是原写入者的身份。
      expect(evidence[0]).toMatchObject({
        lookedUpBy: SYSTEM_SWEEP_LOOKUP_ACTOR,
        asUserId: 'u-alice',
        conclusion: 'executed',
      });
      expect(SYSTEM_SWEEP_LOOKUP_ACTOR).toBe('system:sweep');
    });

    it('第二次要等到 +6h：从上一次询问起算，5 小时不问、7 小时问', async () => {
      const row = await seedQueued({ claimedAt: at(30 * 60) });
      await seedLookup(at(5 * 60));
      probe.lookup.mockResolvedValue(lookup());

      const early = await effects.reconcileDueClaims(base);
      expect(early.asked).toBe(0);
      expect(early.skippedNotDue).toBe(1);
      expect(probe.lookup).not.toHaveBeenCalled();

      const [only] = await lookups().find({ where: { idempotencyKey: KEY } });
      await lookups().update(only.id, { at: at(7 * 60) });
      const later = await effects.reconcileDueClaims(base);

      expect(later.asked).toBe(1);
      expect(later.unresolved).toBe(1);
      expect(await lookups().count()).toBe(2);
      const still = await claims().findOne({ where: { id: row.id } });
      expect(still?.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    });

    it('问满 4 次 ⇒ 不再自动问（时间过去多久都一样），计数不增', async () => {
      await seedQueued({ claimedAt: at(60 * 24 * 30) });
      for (let i = 1; i <= 4; i++) await seedLookup(at(i * 24 * 60));
      probe.lookup.mockResolvedValue(lookup());

      const r = await effects.reconcileDueClaims(base);

      expect(r.asked).toBe(0);
      expect(r.skippedExhausted).toBe(1);
      expect(probe.lookup).not.toHaveBeenCalled();
      expect(await lookups().count()).toBe(4);
    });

    it('人工对账计入预算：3 次人工 + 1 次自动后用满，再下一次不再问', async () => {
      await seedQueued({ claimedAt: at(60 * 24 * 30) });
      // Last of the three is 5 days ago, so the fourth interval (+72h) is already past — the budget,
      // not the clock, is what this case is about.
      // 三次里最近的一次在 5 天前，故第四档（+72h）早已过去 —— 本条要看的是预算，不是时钟。
      for (let i = 1; i <= 3; i++) await seedLookup(at((5 + i) * 24 * 60));
      probe.lookup.mockResolvedValue(lookup());

      const fourth = await effects.reconcileDueClaims(base);
      expect(fourth.asked).toBe(1);
      expect(await lookups().count()).toBe(4);

      const fifth = await effects.reconcileDueClaims(base);
      expect(fifth.asked).toBe(0);
      expect(fifth.skippedExhausted).toBe(1);
      expect(probe.lookup).toHaveBeenCalledTimes(1);
    });

    it('目标不可查（canAsk=false）⇒ 跳过，且**不写**证据行（不是每小时一条噪声）', async () => {
      await seedQueued({ claimedAt: at(60 * 24 * 30) });
      probe.canAsk.mockReturnValue(false);

      const r = await effects.reconcileDueClaims(base);

      expect(r.skippedUnaskable).toBe(1);
      expect(r.asked).toBe(0);
      expect(probe.lookup).not.toHaveBeenCalled();
      expect(await lookups().count()).toBe(0);
    });

    it('目标答「没执行」⇒ 走既有路径收敛为 released', async () => {
      const row = await seedQueued();
      probe.lookup.mockResolvedValue(lookup({ conclusion: 'not_executed', reason: null }));

      const r = await effects.reconcileDueClaims(base);

      expect(r.asked).toBe(1);
      expect(r.converged).toBe(1);
      const after = await claims().findOne({ where: { id: row.id } });
      expect(after?.status).toBe(WRITE_CLAIM_STATUS.RELEASED);
      expect(after?.releaseReason).toBe('target_status_not_executed');
    });

    it('每趟上限：到期行多于上限只问最老的几条，其余顺延；不可查的行不占额度；下一趟把余下问掉', async () => {
      // cap = 2 for this assembly; the default (25) is pinned in the schedule spec.
      // 本装配把上限设成 2；默认值 25 由计划那份用例钉住。
      effects = new AiToolEffectsService(
        ds.getRepository(AiToolSideEffect),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { get: (k: string) => (k === 'CLAIM_RECONCILE_MAX_PER_PASS' ? 2 : undefined) } as never,
        undefined,
        claims(),
        undefined,
        probe as any,
        lookups(),
      );
      probe.canAsk.mockImplementation((toolName: string) => toolName === TOOL);
      probe.lookup.mockResolvedValue(lookup());

      // Oldest first: an unaskable hold, then three due ones the cap can only partly serve.
      // 最老在前：一条问不了的，随后是三条到期但额度只够一部分的。
      await seedQueued({ idempotencyKey: 'k-oldest', toolName: 'create_todo', claimedAt: at(10 * 60) });
      await seedQueued({ idempotencyKey: 'k-a', claimedAt: at(9 * 60) });
      await seedQueued({ idempotencyKey: 'k-b', claimedAt: at(8 * 60) });
      await seedQueued({ idempotencyKey: 'k-c', claimedAt: at(7 * 60) });

      const first = await effects.reconcileDueClaims(base);

      expect(first.asked).toBe(2);
      expect(first.deferredByPassCap).toBe(1);
      // The unaskable row is skipped, not charged against the budget — the two asks below are the two
      // oldest *askable* holds, in age order.
      // 不可查的行是跳过，不占额度 —— 下面两次询问是最老的两条**可查**占位，按年龄顺序。
      expect(first.skippedUnaskable).toBe(1);
      expect(probe.lookup.mock.calls.map((call) => call[1])).toEqual(['k-a', 'k-b']);

      const second = await effects.reconcileDueClaims(base);

      expect(second.asked).toBe(1);
      expect(second.deferredByPassCap).toBe(0);
      // k-a / k-b were answered `unknown` this hour, so their next interval (+6h) is not due yet; the
      // deferred row is still due and is served now.
      // k-a / k-b 这小时问过（答 unknown），下一档 +6h 未到；被顺延的那条仍到期，这一趟问它。
      expect(probe.lookup.mock.calls.map((call) => call[1])).toEqual(['k-a', 'k-b', 'k-c']);
    });

    it('同一进程里两趟重叠 ⇒ 第二趟直接返回，不对同一行发第二次查询', async () => {
      await seedQueued({ claimedAt: at(60 * 24 * 30) });
      let release!: (value: unknown) => void;
      probe.lookup.mockImplementation(
        () => new Promise((resolve) => (release = resolve)),
      );

      const first = effects.reconcileDueClaims(base);
      for (let i = 0; i < 200 && probe.lookup.mock.calls.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 1));
      }
      expect(probe.lookup).toHaveBeenCalledTimes(1);

      const overlapping = await effects.reconcileDueClaims(base);
      expect(overlapping.asked).toBe(0);
      expect(probe.lookup).toHaveBeenCalledTimes(1);

      release(lookup({ conclusion: 'executed', reason: null }));
      expect((await first).asked).toBe(1);
      expect(probe.lookup).toHaveBeenCalledTimes(1);
    });

    it('仍在途（open）的行不是候选：自动重问只针对已进入待裁队列的滞留', async () => {
      await claims().save(
        claims().create(
          staleClaim({ claimedAt: at(60 * 24 * 30), decisionState: WRITE_CLAIM_DECISION_STATE.OPEN }),
        ),
      );

      const r = await effects.reconcileDueClaims(base);

      expect(r.candidates).toBe(0);
      expect(probe.lookup).not.toHaveBeenCalled();
    });

    it('人已释放（closed_unknown）的行不是候选：那份决定不得被自动查询覆盖', async () => {
      await claims().save(
        claims().create(
          staleClaim({
            claimedAt: at(60 * 24 * 30),
            decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
            releaseReason: 'manual_release_unknown',
          }),
        ),
      );

      const r = await effects.reconcileDueClaims(base);

      expect(r.candidates).toBe(0);
      expect(probe.lookup).not.toHaveBeenCalled();
      expect(await lookups().count()).toBe(0);
    });

    it('没有证据仓储 ⇒ 完全不自动问（读不回次数，就等于没有上限）', async () => {
      // Rebuild without the lookup repository: the attempt count cannot be read back, so a schedule
      // here would be unbounded by construction. The safe reading is "do not ask".
      // 去掉查询证据仓储重建：次数读不回来，此时的计划按构造无界。安全的读法是「不要问」。
      effects = new AiToolEffectsService(
        ds.getRepository(AiToolSideEffect),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        claims(),
        undefined,
        probe as any,
        undefined,
      );
      await seedQueued({ claimedAt: at(60 * 24 * 30) });

      const r = await effects.reconcileDueClaims(base);

      expect(r.candidates).toBe(0);
      expect(r.asked).toBe(0);
      expect(probe.lookup).not.toHaveBeenCalled();
    });
  });
});

// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { AiAuditLog } from '../entities/ai-audit-log.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { AiToolEffectsService, SYSTEM_SWEEP_LOOKUP_ACTOR } from './ai-tool-effects.service';
import { buildKey } from './effect-shared';
import { AuditService } from './audit.service';
import { WriteClaimStore } from './write-claim.store';
import { WriteClaimDecisionService } from './write-claim-decision.service';
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
  basis: null,
  ...overrides,
});

describe('AW-17 目标状态对账（只读查询收敛 unknown）', () => {
  let ds: DataSource;
  let effects: AiToolEffectsService;
  let probe: { available: jest.Mock; canAsk: jest.Mock; lookup: jest.Mock };

  const claims = () => ds.getRepository(AiWriteClaim);
  const lookups = () => ds.getRepository(TargetStatusLookupRow);
  const auditRepo = () => ds.getRepository(AiAuditLog);

  const build = (
    probeOrUndefined: boolean = true,
    // R-6b: an override lets a case simulate a lookup insert that failed while the reads see nothing.
    // R-6b：允许覆写，以便模拟「插入失败、读出为空」的证据表。
    lookupStore: ReturnType<typeof lookups> = lookups(),
    // R-9: the tool's capability declaration decides whether a weak reading may release. The default
    // fake declares nothing, so `dedup` resolves to `unknown` — the fail-closed reading.
    // R-9：工具的能力声明决定弱读数能否释放。默认替身什么都不声明，故 `dedup` 解析为 `unknown` ——
    // 失败关闭的读法。
    tool: { capabilities?: Record<string, string> } = { capabilities: {} },
  ): void => {
    probe = { available: jest.fn(() => true), canAsk: jest.fn(() => true), lookup: jest.fn() };
    // R-3: the release row's one builder is the decision service's — the reconcile path calls it, and
    // these cases read the row back from a real table, not from a double.
    // R-3：释放行的唯一构造器在决定服务里 —— 对账路径调它，下面的用例从真表读回那一行，而不是替身。
    const audit = new AuditService(
      auditRepo(),
      new AuditChainService({ get: () => undefined } as never),
      ds,
    );
    const decision = new WriteClaimDecisionService(
      claims(),
      lookupStore,
      audit,
      { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? 60 : undefined) } as never,
    );
    effects = new AiToolEffectsService(
      ds.getRepository(AiToolSideEffect),
      undefined, // revoker
      undefined, // externalRevoker
      undefined, // reporter
      undefined, // auditChain
      { getTool: () => tool } as never, // toolRegistry (R-9: dedup declaration)
      undefined, // dataSource
      undefined, // operationAudit
      undefined, // configService (defaults to the 60-minute threshold)
      undefined, // snapshotCaptor
      claims(), // claimsRepo
      undefined, // comparabilityRepo
      (probeOrUndefined ? probe : undefined) as any, // statusProbe
      lookupStore, // lookupsRepo
      decision, // writeClaimDecision (R-3)
    );
  };

  const seed = async (): Promise<AiWriteClaim> => claims().save(claims().create(staleClaim()));

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, AiWriteClaim, TargetStatusLookupRow, AiAuditLog],
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

  it('目标答「没执行」⇒ 账收敛为 released（重试的门重新打开），证据记下结论与种类', async () => {
    const row = await seed();
    probe.lookup.mockResolvedValue(
      lookup({ conclusion: 'not_executed', reason: null, basis: 'receipt' }),
    );

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('reconciled');
    expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.RELEASED);

    const after = await claims().findOne({ where: { id: row.id } });
    expect(after?.status).toBe(WRITE_CLAIM_STATUS.RELEASED);
    expect(after?.releaseReason).toBe('target_status_not_executed');

    const evidence = await lookups().find({ where: { idempotencyKey: KEY } });
    expect(evidence[0].conclusion).toBe('not_executed');
    // R-1：目标声明的种类随证据落库。
    expect(evidence[0].basis).toBe('receipt');
  });

  /**
   * R-9: a weak reading is not a release. A `current_state` sample (or one with no declared basis)
   * says only "not there now"; on an effect whose target guarantees no dedup it cannot show that the
   * write never happened, so the hold stays claimed and the same key cannot execute again. The refusal
   * is still a decision: one `claim_release` row opening `release refused (weak_reading)` names the
   * reading that could not release it.
   *
   * R-9：弱读数不是释放。当前状态采样（或未声明种类的读数）只说了「现在不在」；在目标不保证去重的
   * 效果上，它证明不了那次写没发生，故占位保持 claimed、同一个键不能再执行。拒绝仍是一次决定：一条以
   * `release refused (weak_reading)` 开头的 `claim_release` 行点名那份没能放行的读数。
   */
  describe('R-9 弱读数不释放占位', () => {
    it('判据①：current_state 的 not_executed + 无去重声明 ⇒ 不释放，决定行点名读数', async () => {
      const row = await seed();
      probe.lookup.mockResolvedValue(
        lookup({
          conclusion: 'not_executed',
          reason: null,
          basis: 'current_state',
          queriedAt: '2026-11-27T01:00:00.000Z',
        }),
      );

      const r = await effects.reconcileClaim(row.id, 'admin-1');

      expect(r.outcome).toBe('not_released');
      expect(r.conclusion).toBe('not_executed');
      expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.CLAIMED);

      // The ledger does not move: the key stays occupied, so a retry is refused by the arbitration
      // point — a release would have opened it.
      // 账不动：键仍被占住，重试会被仲裁点拒绝 —— 释放才会打开它。
      const after = await claims().findOneByOrFail({ id: row.id });
      expect(after.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(after.releaseReason ?? null).toBeNull();

      // The reading is on record — the refusal did not swallow the attempt.
      // 读数照样留证 —— 拒绝没有把这次尝试吞掉。
      const [evidence] = await lookups().find({ where: { idempotencyKey: KEY } });
      expect(evidence).toMatchObject({ conclusion: 'not_executed', basis: 'current_state' });

      const rows = await auditRepo().find({ where: { action: 'claim_release' } });
      expect(rows).toHaveLength(1);
      const [decision] = rows;
      expect(decision.userId).toBe('admin-1');
      // A refusal carries no release evidence column — that column belongs to a release.
      // 拒绝不带释放证据列 —— 那一列属于释放。
      expect(decision.releaseLookups ?? null).toBeNull();
      const detail = decision.detail ?? '';
      expect(detail.startsWith('release refused (weak_reading)')).toBe(true);
      expect(detail).toContain(`write claim #${row.id}`);
      expect(detail).toContain('a current-state reading');
      expect(detail).toContain('dedup declaration is unknown');
      expect(detail).toContain('the hold stays claimed and its key stays occupied');
      // The reading is named: who asked, by which query, when, what it concluded and its basis.
      // 点名读数：谁问的、按什么查的、何时、结论与种类。
      expect(detail).toContain(`#${evidence.id} by admin-1`);
      expect(detail).toContain(`GET /contracts/status/${KEY}`);
      expect(detail).toContain('2026-11-27T01:00:00.000Z');
      expect(detail).toContain('→ not_executed, basis=current_state');
    });

    it('判据②：receipt 的 not_executed 对任何效果都释放 —— 默认替身未声明去重也照样放行', async () => {
      // The default fake declares no `dedup`; only the receipt licenses this release.
      // 默认替身没有声明 `dedup`；放行只靠这张收据。
      const row = await seed();
      probe.lookup.mockResolvedValue(
        lookup({ conclusion: 'not_executed', reason: null, basis: 'receipt' }),
      );

      const r = await effects.reconcileClaim(row.id, 'admin-1');

      expect(r.outcome).toBe('reconciled');
      expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.RELEASED);
      expect((await claims().findOneByOrFail({ id: row.id })).status).toBe(
        WRITE_CLAIM_STATUS.RELEASED,
      );
      // No refusal row is written: this answer was a release.
      // 不写拒绝行：这个答案就是一次释放。
      expect(await auditRepo().count({ where: { action: 'claim_release' } })).toBe(1);
      const [release] = await auditRepo().find({ where: { action: 'claim_release' } });
      expect(release.detail).toContain('→ released');
    });

    it('判据①对照：current_state + 目标声明 dedup: yes ⇒ 仍释放（重发同一键对目标安全）', async () => {
      build(true, lookups(), { capabilities: { dedup: 'yes' } });
      const row = await seed();
      probe.lookup.mockResolvedValue(
        lookup({ conclusion: 'not_executed', reason: null, basis: 'current_state' }),
      );

      const r = await effects.reconcileClaim(row.id, 'admin-1');

      expect(r.outcome).toBe('reconciled');
      expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.RELEASED);
      expect((await claims().findOneByOrFail({ id: row.id })).status).toBe(
        WRITE_CLAIM_STATUS.RELEASED,
      );
    });

    it('判据③：第二次弱读数被拒时，决定行带上前一次读数（谁问的、问了什么、结论与种类）', async () => {
      const row = await seed();
      probe.lookup.mockResolvedValueOnce(
        lookup({
          conclusion: 'not_executed',
          reason: null,
          basis: 'current_state',
          queriedAt: '2026-11-27T01:00:00.000Z',
        }),
      );
      await effects.reconcileClaim(row.id, 'admin-1');
      probe.lookup.mockResolvedValueOnce(
        lookup({
          conclusion: 'not_executed',
          reason: null,
          basis: 'current_state',
          queriedAt: '2026-11-27T02:00:00.000Z',
        }),
      );

      const second = await effects.reconcileClaim(row.id, SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(second.outcome).toBe('not_released');

      const decisions = await auditRepo().find({
        where: { action: 'claim_release' },
        order: { id: 'ASC' },
      });
      expect(decisions).toHaveLength(2);
      const detail = decisions[1].detail ?? '';
      const [firstReading, latestReading] = await lookups().find({
        where: { idempotencyKey: KEY },
        order: { id: 'ASC' },
      });
      // Both readings are named, newest first: the previous ask (a person) travels with this one
      // (the sweep), each with its query, conclusion and basis.
      // 两条读数都点名、最近在前：前一次（人发起）与这一次（清扫）各自带上查询、结论与种类。
      expect(detail).toContain('readings (newest first)');
      expect(detail).toContain(`#${latestReading.id} by ${SYSTEM_SWEEP_LOOKUP_ACTOR}`);
      expect(detail).toContain(`#${firstReading.id} by admin-1`);
      expect(detail).toContain(`GET /contracts/status/${KEY}`);
      expect(detail).toContain('→ not_executed, basis=current_state');
      // The failed release did not move the ledger between the two asks.
      // 两次询问之间，那次失败的释放没有动过账。
      expect((await claims().findOneByOrFail({ id: row.id })).status).toBe(
        WRITE_CLAIM_STATUS.CLAIMED,
      );
    });
  });

  /**
   * R-9 supersedes R-1's reverse criterion. R-1 could treat the basis as a label because nothing acted
   * on it; R-9 makes it a gate for a weak reading on an effect whose target guarantees no dedup. An
   * undeclared basis (`null`) is **not** a receipt: silence is not stronger than a current-state
   * sample, and the hold stays claimed.
   *
   * R-9 取代 R-1 的反向判据。R-1 能把种类当标签，是因为没有消费者；R-9 让它成为一道闸 —— 当目标是
   * 不保证去重的效果、而读数又弱时。未声明种类（`null`）**不是**收据：沉默并不比当前状态采样更强，
   * 占位保持 claimed。
   */
  it('R-9：种类未记录（null）不是收据 —— 去重无保证时不释放，决定行点名这份弱读数', async () => {
    const row = await seed();
    probe.lookup.mockResolvedValue(lookup({ conclusion: 'not_executed', reason: null, basis: null }));

    const r = await effects.reconcileClaim(row.id, 'admin-1');

    expect(r.outcome).toBe('not_released');
    expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    const evidence = await lookups().find({ where: { idempotencyKey: KEY } });
    expect(evidence[0].basis ?? null).toBeNull();

    const after = await claims().findOneByOrFail({ id: row.id });
    expect(after.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    const [decision] = await auditRepo().find({ where: { action: 'claim_release' } });
    expect(decision.detail).toContain('release refused (weak_reading)');
    expect(decision.detail).toContain('a reading with no declared basis');
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
   * R-3: a release the target's answer caused is a **decision**, and the hold row does not keep it (a
   * re-claim reuses that row and clears its release columns). So the decision is also one chained
   * `claim_release` row — the same action and the same builder the manual release uses. These cases
   * read that row back: what a reader can tell from it, that a re-claim does not erase it, and that
   * the `executed` path leaves no such row.
   *
   * R-3：目标回答引起的释放是一次**决定**，而占位行留不住它（重占位会复用那一行并清掉释放列）。故
   * 这份决定同时是一条带链的 `claim_release` 行 —— 与人工释放同一动作、同一构造器。下面把那一行读回：
   * 读者能从它读出什么、重占位抹不掉它、`executed` 路径不留这种行。
   */
  describe('R-3 目标驱动的释放留一条决定行', () => {
    const releaseRows = () => auditRepo().find({ where: { action: 'claim_release' } });

    it('目标答 not_executed ⇒ 链上一行：读得出谁发起、目标答了什么、已释放可重占位、效果未知', async () => {
      const row = await seed();
      probe.lookup.mockResolvedValue(
        lookup({
          conclusion: 'not_executed',
          reason: null,
          basis: 'receipt',
          queriedAt: '2026-11-24T02:00:00.000Z',
        }),
      );

      const r = await effects.reconcileClaim(row.id, SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(r.outcome).toBe('reconciled');

      const rows = await releaseRows();
      expect(rows).toHaveLength(1);
      const [decision] = rows;
      expect(decision.userId).toBe(SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(decision.tool).toBe(TOOL);
      expect(decision.source).toBe('claim_release');
      // No outcome word: the hold's conclusion deliberately stays unknown — same stance as a manual
      // release, where any word would pronounce on a fact nobody established.
      // 不写结局词：占位的结论有意保持未知 —— 与人工释放同一立场，任何词都会替一个没人确立的事实下判决。
      expect(decision.outcome ?? null).toBeNull();

      const detail = decision.detail ?? '';
      expect(detail).toContain(`release write claim #${row.id}`);
      expect(detail).toContain('→ released');
      expect(detail).toContain('origin: target answered not_executed');
      // 目标被问的时刻在行里（读数的时间也另存于 releaseLookups 的 at）
      expect(detail).toContain('2026-11-24T02:00:00.000Z');
      expect(detail).toContain('initiated by: system:sweep (automatic sweep)');
      expect(detail).toContain('lookups: 1 asked (see releaseLookups)');
      expect(detail).toContain('released for re-claim, effect unknown');
      // 不得读成「从未发生」：这一行记的是一次释放，不是「什么都没试过」。
      expect(detail).toContain('the write was attempted');

      // 读数以数据落库：次数 + 每次的时间与结论（不必解析散文，也不必联接查询表）
      const evidence = JSON.parse(decision.releaseLookups!) as {
        count: number;
        items: Array<{ id: number; at: string; conclusion: string; lookedUpBy: string }>;
      };
      expect(evidence.count).toBe(1);
      expect(evidence.items[0].conclusion).toBe('not_executed');
      expect(evidence.items[0].lookedUpBy).toBe(SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(Number.isNaN(Date.parse(evidence.items[0].at))).toBe(false);
      // F-123/F-124：目标驱动的释放同样点名它的读数行 —— 拷贝与源之间有一条可走回去的路。
      const [source] = await lookups().find({ where: { idempotencyKey: KEY } });
      expect(evidence.items[0].id).toBe(source.id);
    });

    it('重占位覆盖占位行之后，链上的决定行仍在（决定留得住）', async () => {
      // The re-claim is only possible because the target said nothing ran; it then reuses the hold row,
      // which is exactly why the decision cannot live there.
      // 目标说没跑，重占位才被允许；而它复用的正是那一行 —— 决定正因此不能只存在那里。
      const ctx = { userId: 'u-alice', conversationId: 'conv-1', toolName: TOOL, args: { to: 'a@b.c' } };
      const row = await claims().save(claims().create(staleClaim({ idempotencyKey: buildKey(ctx) })));
      probe.lookup.mockResolvedValue(lookup({ conclusion: 'not_executed', reason: null, basis: 'receipt' }));

      await effects.reconcileClaim(row.id, 'admin-1');
      expect((await claims().findOneByOrFail({ id: row.id })).status).toBe(
        WRITE_CLAIM_STATUS.RELEASED,
      );

      const store = new WriteClaimStore({} as never, claims());
      const again = await store.claimWrite(ctx);
      expect(again.won).toBe(true);

      const reClaimed = await claims().findOneByOrFail({ id: row.id });
      expect(reClaimed.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(reClaimed.releaseReason ?? null).toBeNull();
      expect(reClaimed.attempts).toBe(2);

      // 占位行不再说它是怎么被释放的；链上那一行仍然说得出。
      const rows = await releaseRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].detail).toContain('origin: target answered not_executed');
    });

    it('目标答 executed ⇒ 走 settle，不写释放行（决定行只属于释放）', async () => {
      const row = await seed();
      probe.lookup.mockResolvedValue(lookup({ conclusion: 'executed', reason: null }));

      const r = await effects.reconcileClaim(row.id, 'admin-1');

      expect(r.claimStatus).toBe(WRITE_CLAIM_STATUS.SETTLED);
      expect(await releaseRows()).toHaveLength(0);
    });

    it('人工发起的对账 ⇒ detail 区分「人的动作」，不是自动清扫', async () => {
      const row = await seed();
      probe.lookup.mockResolvedValue(lookup({ conclusion: 'not_executed', reason: null, basis: 'receipt' }));

      await effects.reconcileClaim(row.id, 'admin-7');

      const [decision] = await releaseRows();
      expect(decision.userId).toBe('admin-7');
      expect(decision.detail).toContain('initiated by: user admin-7 (manual reconcile)');
      expect(decision.detail).not.toContain('automatic sweep');
    });

    /**
     * R-6b: the evidence row can be missing while the target's answer is certain — `_recordLookup`
     * swallows a failed insert, so the decision still lands. The same row then must not say "never
     * queried": it says the record is missing, and the off-chain column carries `recorded: false`.
     *
     * R-6b：目标答案确定，证据行却可能缺失 —— `_recordLookup` 会吞掉插入失败，故决定照样落库。那
     * 一行便不得再说「从未问过」：它说记录缺失，链外列带 `recorded: false`。
     */
    it('读数行写失败（被吞）⇒ 决定行说「记录缺失」，不写「从未问过」', async () => {
      // The insert throws; the one-statement read (F-127) sees an empty table — exactly the
      // post-swallow state.
      // 插入抛错；单语句读（F-127）看到空表 —— 正是被吞之后的模样。
      const emptyRead = {
        select: () => emptyRead,
        addSelect: () => emptyRead,
        where: () => emptyRead,
        orderBy: () => emptyRead,
        addOrderBy: () => emptyRead,
        limit: () => emptyRead,
        getRawAndEntities: async () => ({ entities: [], raw: [] }),
      };
      const failingStore = {
        create: (x: unknown) => x,
        save: async () => {
          throw new Error('lookup table down');
        },
        createQueryBuilder: () => emptyRead,
      } as never;
      build(true, failingStore);
      const row = await seed();
      probe.lookup.mockResolvedValue(
        lookup({
          conclusion: 'not_executed',
          reason: null,
          basis: 'receipt',
          queriedAt: '2026-11-25T01:00:00.000Z',
        }),
      );

      const r = await effects.reconcileClaim(row.id, SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(r.outcome).toBe('reconciled');

      const [decision] = await releaseRows();
      expect(decision.detail).toContain('origin: target answered not_executed');
      expect(decision.detail).toContain('lookup record missing');
      expect(decision.detail).toContain('the target was asked, the lookup row was not recorded');
      expect(decision.detail).not.toContain('never queried');
      expect(JSON.parse(decision.releaseLookups!)).toEqual({
        count: 0,
        askable: null,
        recorded: false,
        items: [],
      });
    });

    /**
     * R-6b residual: older readings can hide a missing one. When the target answers again and this
     * ask's evidence row fails to land, the table still holds the earlier readings, so the count is
     * non-zero and the zero-count case above never fires — yet the row's `N asked` would read as if
     * this answer were among them. The fact that must survive is about **this** ask: its row is
     * missing (`recorded: false`), and the prose says so beside the count. The copied items keep
     * their meaning — readings of earlier asks, not evidence of this one.
     *
     * R-6b 残留：旧读数会遮住缺失的那一条。目标再次作答、而这次询问的证据行没落库时，表里仍有更早
     * 的读数，计数非零，上面的零计数用例便不会触发 —— 但行内的「N asked」会读成这次答案也在其中。
     * 必须留住的事实是关于**这一次**询问的：它的行缺失（`recorded: false`），散文在次数旁明说。
     * 拷贝条目仍按本来的意思读 —— 更早那几次询问的读数，不是这一次的证据。
     */
    it('已有旧读数而本次读数行写失败（被吞）⇒ 标出本次未记录，不让旧读数冒充', async () => {
      const real = lookups();
      await real.save(
        real.create({
          idempotencyKey: KEY,
          toolName: TOOL,
          lookedUpBy: 'admin-1',
          asUserId: 'u-alice',
          queryMethod: 'GET',
          queryPath: '/contracts/status/' + KEY,
          conclusion: 'unknown',
          reason: 'target-status-unavailable',
          basis: null,
        }),
      );
      // Reads go to the real table, where one older reading is visible; the insert throws — the
      // post-swallow state with a history behind it.
      // 读取走真表，那里看得见一条旧读数；插入抛错 —— 被吞之后、且背后有历史的样子。
      const failingStore = {
        create: (x: unknown) => real.create(x as never),
        save: async () => {
          throw new Error('lookup table down');
        },
        createQueryBuilder: (...args: unknown[]) => real.createQueryBuilder(...(args as [string])),
      } as never;
      build(true, failingStore);
      const row = await seed();
      probe.lookup.mockResolvedValue(
        lookup({
          conclusion: 'not_executed',
          reason: null,
          basis: 'receipt',
          queriedAt: '2026-11-25T02:00:00.000Z',
        }),
      );

      const r = await effects.reconcileClaim(row.id, SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(r.outcome).toBe('reconciled');

      const [decision] = await releaseRows();
      expect(decision.detail).toContain('origin: target answered not_executed');
      expect(decision.detail).toContain(
        'lookups: 1 asked (see releaseLookups; this ask was not recorded)',
      );
      expect(decision.detail).not.toContain('never queried');
      const copy = JSON.parse(decision.releaseLookups!) as {
        count: number;
        recorded?: boolean;
        items: { id: number }[];
      };
      // The count states what the table holds — one earlier ask — and `recorded: false` says this
      // ask is not among it.
      // 计数如实说表里有什么 —— 更早的一次询问；`recorded: false` 说这一次不在其中。
      expect(copy.count).toBe(1);
      expect(copy.recorded).toBe(false);
      expect(copy.items).toHaveLength(1);
    });

    it('旧读数存在但本次读数行已落库 ⇒ 不加「本次未记录」标记（对照）', async () => {
      const real = lookups();
      await real.save(
        real.create({
          idempotencyKey: KEY,
          toolName: TOOL,
          lookedUpBy: 'admin-1',
          asUserId: 'u-alice',
          queryMethod: 'GET',
          queryPath: '/contracts/status/' + KEY,
          conclusion: 'unknown',
          reason: 'target-status-unavailable',
          basis: null,
        }),
      );
      build(true, real);
      const row = await seed();
      probe.lookup.mockResolvedValue(
        lookup({
          conclusion: 'not_executed',
          reason: null,
          basis: 'receipt',
          queriedAt: '2026-11-25T03:00:00.000Z',
        }),
      );

      const r = await effects.reconcileClaim(row.id, SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(r.outcome).toBe('reconciled');

      const [decision] = await releaseRows();
      expect(decision.detail).toContain('lookups: 2 asked (see releaseLookups)');
      expect(decision.detail).not.toContain('this ask was not recorded');
      const copy = JSON.parse(decision.releaseLookups!) as { count: number; recorded?: boolean };
      expect(copy.count).toBe(2);
      expect(copy).not.toHaveProperty('recorded');
    });
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
      probe.lookup.mockResolvedValue(lookup({ conclusion: 'not_executed', reason: null, basis: 'receipt' }));

      const r = await effects.reconcileDueClaims(base);

      expect(r.asked).toBe(1);
      expect(r.converged).toBe(1);
      const after = await claims().findOne({ where: { id: row.id } });
      expect(after?.status).toBe(WRITE_CLAIM_STATUS.RELEASED);
      expect(after?.releaseReason).toBe('target_status_not_executed');
    });

    it('R-9：自动清扫拿到弱读数 ⇒ 计 held（查询已发）而非 converged，账保持 claimed，决定行记 system:sweep', async () => {
      const row = await seedQueued();
      probe.lookup.mockResolvedValue(
        lookup({ conclusion: 'not_executed', reason: null, basis: 'current_state' }),
      );

      const r = await effects.reconcileDueClaims(base);

      expect(r.asked).toBe(1);
      expect(r.held).toBe(1);
      expect(r.converged).toBe(0);
      expect(r.unresolved).toBe(0);
      // The row is not converged: the same key still cannot execute.
      // 行没有收敛：同一个键仍不能执行。
      expect((await claims().findOneByOrFail({ id: row.id })).status).toBe(
        WRITE_CLAIM_STATUS.CLAIMED,
      );
      const [decision] = await auditRepo().find({ where: { action: 'claim_release' } });
      expect(decision.userId).toBe(SYSTEM_SWEEP_LOOKUP_ACTOR);
      expect(decision.detail).toContain('release refused (weak_reading)');
      expect(decision.detail).toContain('initiated by: system:sweep (automatic sweep)');
    });

    // B-3: one row's decision write failing must not spend the hour for the rest of the queue.
    // B-3：一行的决定行写失败，不得替队列里其余行花掉这个小时。
    it('B-3：决定行写失败 ⇒ 本趟继续问其余到期占位，失败计入 failed', async () => {
      const first = await seedQueued({ idempotencyKey: 'k-b3-1', userId: 'u-alice' });
      const second = await seedQueued({ idempotencyKey: 'k-b3-2', userId: 'u-bob' });
      probe.lookup.mockImplementation((_tool: string, key: string) =>
        Promise.resolve(
          lookup({
            conclusion: 'not_executed',
            reason: null,
            basis: 'receipt',
            queryPath: '/contracts/status/' + key,
          }),
        ),
      );
      (effects as any).writeClaimDecision = {
        recordTargetRelease: jest
          .fn()
          .mockRejectedValueOnce(new Error('audit write failed'))
          .mockResolvedValue(undefined),
      };

      const r = await effects.reconcileDueClaims(base);

      expect(r.failed).toBe(1);
      expect(r.asked).toBe(1);
      expect(r.converged).toBe(1);
      expect(probe.lookup).toHaveBeenCalledTimes(2);
      const one = await claims().findOne({ where: { id: first.id } });
      const two = await claims().findOne({ where: { id: second.id } });
      expect(one?.status).toBe(WRITE_CLAIM_STATUS.RELEASED);
      expect(two?.status).toBe(WRITE_CLAIM_STATUS.RELEASED);
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

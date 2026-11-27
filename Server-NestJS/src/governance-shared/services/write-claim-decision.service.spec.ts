// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { AiAuditLog } from '../entities/ai-audit-log.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { AuditChainService } from '../../common/audit-chain/audit-chain.service';
import { AuditService } from './audit.service';
import { buildKey } from './effect-shared';
import { WriteClaimStore } from './write-claim.store';
import { WriteClaimDecisionService } from './write-claim-decision.service';
import { WriteClaimQueryService } from './write-claim-query.service';
import { UserRole } from '../../common/entities/user.entity';

/**
 * AW-16 second slice — the **release procedure** (F-63) and the **expiry / decision policy** (F-64).
 *
 * Real database, real audit chain: the question is not "was a method called" but "what does the ledger
 * say afterwards". Every assertion below reads a row back.
 *
 * The two rules this file exists to pin:
 *   - A release is a **decision**, not a verdict. The claim stays `claimed` (the truth about the write is
 *     still unknown), moves to `closed_unknown`, and the key stays occupied — so the same call is not
 *     silently retried.
 *   - Expiry moves a stale hold into the pending-decision queue. It changes no status and writes no
 *     conclusion; only a human decision or a target answer may move the claim after that.
 *
 * AW-16 第二片 —— **释放程序**（F-63）与**过期 / 决策策略**（F-64）。
 *
 * 真库、真审计链：要回答的不是「方法被调过没有」，而是「事后账上写着什么」。下面每条断言都读回行。
 *
 * 本文件要钉住的两条规则：
 *   - 释放是**决定**、不是判决。占位仍是 `claimed`（这次写的真相仍未知），转入 `closed_unknown`，
 *     键仍被占住 —— 因而同一次调用不会被静默重试。
 *   - 过期把滞留占位移入待裁队列。它不改任何状态、不写任何结论；此后只有人的决定或目标的回答能移动这行。
 */
describe('AW-16 F-63/F-64：释放程序与过期策略', () => {
  let ds: DataSource;
  let service: WriteClaimDecisionService;
  let audit: AuditService;
  let seq = 0;

  /**
   * R-3 follow-up (F-127): every SQL statement the test database runs. "The count and the newest three
   * come from one snapshot" is asserted on the statements themselves — a read made twice cannot be
   * told apart from a read made once by looking only at the result.
   *
   * R-3 后续（F-127）：测试库执行的每一条 SQL。断言「次数与最近三条出自同一快照」落在语句本身 ——
   * 只读结果的话，读两次与读一次分不出来。
   */
  const sqlStatements: string[] = [];
  const recordingLogger = {
    logQuery: (q: string) => {
      sqlStatements.push(q);
    },
    log: () => undefined,
    logQueryError: () => undefined,
    logQuerySlow: () => undefined,
    logSchemaBuild: () => undefined,
    logMigration: () => undefined,
  };

  const repo = () => ds.getRepository(AiWriteClaim);
  const auditRepo = () => ds.getRepository(AiAuditLog);
  /** F-85b: the lookup evidence rows the release row must summarise. / 释放行须概括的查询证据行。 */
  const lookups = () => ds.getRepository(TargetStatusLookupRow);
  /** The read side over the same rows — so "disappeared from the list" is asserted on the real query. */
  // AW-17 合并后 `lookupsRepo` 是必选注入（缺它会把「问过」读成「没问过」）⇒ 这里给一个空历史。
  // After the AW-17 merge `lookupsRepo` is a required injection; an empty history is enough here.
  const query = () =>
    new WriteClaimQueryService(repo(), { find: async () => [] } as never, undefined);
  const STALE_AT = () => new Date(Date.now() - 90 * 60_000);

  const seed = async (over: Partial<AiWriteClaim> = {}): Promise<AiWriteClaim> => {
    seq += 1;
    const saved = await repo().save(
      repo().create({
        idempotencyKey: `k-${seq}`,
        userId: '7',
        conversationId: 'conv-1',
        toolName: 'send_email',
        argsHash: '0123456789abcdef',
        status: WRITE_CLAIM_STATUS.CLAIMED,
        decisionState: WRITE_CLAIM_DECISION_STATE.OPEN,
        claimedAt: STALE_AT(),
        attempts: 1,
        ...over,
      }),
    );
    return saved;
  };

  /** Read the row back from the database — the entity's in-memory default is not evidence. */
  const load = (id: number) => repo().findOneByOrFail({ id });

  /**
   * F-85b: one lookup evidence row. `at` is written explicitly (CreateDateColumn would otherwise stamp
   * "now") so the order the release row reports is the order this test intended.
   *
   * F-85b：一条查询证据行。`at` 显式写入（否则 CreateDateColumn 会盖上「此刻」），于是释放行报出的
   * 顺序就是本用例指定的顺序。
   */
  const seedLookup = async (
    idempotencyKey: string,
    at: Date,
    over: Partial<TargetStatusLookupRow> = {},
  ): Promise<TargetStatusLookupRow> => {
    const saved = await lookups().save(
      lookups().create({
        idempotencyKey,
        toolName: 'send_email',
        lookedUpBy: 'admin-2',
        asUserId: '7',
        queryMethod: 'GET',
        queryPath: `/actions/${idempotencyKey}`,
        conclusion: 'not_executed',
        reason: null,
        ...over,
      }),
    );
    await lookups().update(saved.id, { at });
    return saved;
  };

  /**
   * R-6: the same assembly plus a probe stub, so askability is a known fact rather than `null`.
   *
   * R-6：与上面同一套装配，外加一个探针桩，于是可问性是已知事实而不是 `null`。
   */
  const serviceWithProbe = (askable: boolean) =>
    new WriteClaimDecisionService(
      repo(),
      lookups(),
      audit,
      { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? 60 : undefined) } as never,
      {
        canAsk: () => askable,
        lookup: async () => {
          throw new Error('this test only asks whether the tool can be asked');
        },
      } as never,
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiWriteClaim, AiAuditLog, TargetStatusLookupRow],
      synchronize: true,
      logging: true,
      logger: recordingLogger as never,
    });
    await ds.initialize();
    const chain = new AuditChainService({ get: () => undefined } as never);
    audit = new AuditService(auditRepo(), chain, ds);
    service = new WriteClaimDecisionService(
      repo(),
      lookups(),
      audit,
      { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? 60 : undefined) } as never,
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  /**
   * R-4: the view a review screen would have frozen when it read this row — the release is bound to
   * exactly these two values. Passing the row's *current* values means "the screen still matches".
   *
   * R-4：复核屏幕读这一行时会冻结的视图 —— 释放绑定的就是这两个值。传行**当前**的值即表示「屏幕仍然对得上」。
   */
  const viewOf = (
    claim: Pick<AiWriteClaim, 'decisionState'>,
    lastLookupId: number | null = null,
  ) => ({ decisionState: claim.decisionState, lastLookupId });

  describe('F-63 释放程序', () => {
    it('滞留占位：释放 = 转入 closed_unknown、**状态仍 claimed**、审计行落库且不带结论词', async () => {
      const claim = await seed();

      const res = await service.release(
        claim.id,
        { userId: 'admin-1', username: 'ops-admin' },
        { note: '目标不可达；票据 OPS-7 已确认目标无此记录', evidenceRef: 'OPS-7', view: viewOf(claim) },
      );

      expect(res.outcome).toBe('released_unknown');
      expect(res.auditRowId).toBeGreaterThan(0);

      const row = await load(claim.id);
      // 释放**不是**「确认未落库」：`released` 会断言一个我们没有的事实。
      expect(row.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
      expect(row.releaseReason).toBe('manual_release_unknown');

      const rows = await auditRepo().find({ where: { action: 'claim_release' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe('admin-1');
      expect(rows[0].tool).toBe('send_email');
      expect(rows[0].detail).toContain('OPS-7');
      expect(rows[0].detail).toContain('目标无此记录');
      // 没有 outcome：冻结词表不为这个动作定义结局，任何词都会替未知下一个判决。
      expect(rows[0].outcome ?? null).toBeNull();

      // 读侧对齐：在途视图里消失，只有显式查「已关闭」才看得到。
      expect((await query().list({})).total).toBe(0);
      const closed = await query().list({ decisionState: 'closed_unknown' });
      expect(closed.total).toBe(1);
      expect(closed.items[0].decisionState).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
    });

    it('F-85b：问过两次（都说没执行）后释放 ⇒ 审计行读得出「两次都答 not_executed」，最近在前', async () => {
      const claim = await seed();
      await seedLookup(claim.idempotencyKey, new Date('2026-11-22T10:00:00Z'), { basis: 'receipt' });
      const newest = await seedLookup(claim.idempotencyKey, new Date('2026-11-22T12:00:00Z'));

      const res = await service.release(
        claim.id,
        { userId: 'admin-1', username: 'ops-admin' },
        // R-4：屏幕看到的是其中最新那条，故视图点名它。
        { note: '两次目标查询都说没执行，键仍保留', view: viewOf(claim, newest.id) },
      );

      expect(res.outcome).toBe('released_unknown');
      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      // 散文只留次数：读行的人先知道「问过两次」。
      expect(row.detail).toContain('lookups: 2 asked (see releaseLookups)');
      expect(row.detail).not.toContain('never queried');
      // 读数本身进结构化列，最近在前 —— 不必解析 detail、也不必再联接查询表。
      const structured = JSON.parse(row.releaseLookups!) as {
        count: number;
        items: Array<{ at: string; conclusion: string; basis: string; lookedUpBy: string }>;
      };
      expect(structured.count).toBe(2);
      expect(structured.items.map((i) => i.conclusion)).toEqual(['not_executed', 'not_executed']);
      expect(structured.items[0].at).toBe('2026-11-22T12:00:00.000Z');
      expect(structured.items[1].at).toBe('2026-11-22T10:00:00.000Z');
      expect(structured.items[0].lookedUpBy).toBe('admin-2');
      // R-1：两条结论相同的读数仍按种类分得开；未记录的那条是 `unknown`，不是被猜成 `receipt`。
      expect(structured.items.map((i) => i.basis)).toEqual(['unknown', 'receipt']);
    });

    it('F-85b：从未问过就释放 ⇒ 审计行**明写未查询**，不留空当默认', async () => {
      const claim = await seed();

      const res = await service.release(claim.id, { userId: 'admin-1' }, { note: '没有查询记录，直接释放', view: viewOf(claim) });

      expect(res.outcome).toBe('released_unknown');
      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      expect(row.detail).toContain('lookups: none (never queried)');
      // 没有查询读数，就不能出现任何结论词 —— 空历史不是答案。
      expect(row.detail).not.toMatch(/executed/);
      // 结构化列仍写出来，但为空列表：读的人看到的是「问过 0 次」，不是「这一列没有」。
      // R-6：本装配没有探针 ⇒ 可问性未知，记 null 而不是 false —— 不臆断工具问不了。
      expect(JSON.parse(row.releaseLookups!)).toEqual({ count: 0, askable: null, items: [] });
    });

    it('F-85b：证据读取失败 ⇒ 状态未改、无审计行（读取在条件更新之前）', async () => {
      const claim = await seed();
      const failing = new WriteClaimDecisionService(
        repo(),
        {
          // F-127: the evidence read is one statement now, so the failure is injected where it starts.
          // F-127：证据读取现在是一条语句，故在它起步处注入失败。
          createQueryBuilder: () => {
            throw new Error('lookup store down');
          },
        } as never,
        audit,
        { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? 60 : undefined) } as never,
      );

      await expect(
        failing.release(claim.id, { userId: 'admin-1' }, { note: '读取应失败', view: viewOf(claim) }),
      ).rejects.toThrow('lookup store down');

      // 读在更新之前：失败时这条路径什么都没留下 —— 没有「有决定、无记录」的账。
      const row = await load(claim.id);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.OPEN);
      expect(row.releaseReason ?? null).toBeNull();
      expect(await auditRepo().count()).toBe(0);
    });

    it('待裁队列里的行可以被释放（队列可处置）', async () => {
      const claim = await seed({ decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION });

      const res = await service.release(claim.id, { userId: 'admin-1' }, { note: '已核对，无法定论', view: viewOf(claim) });

      expect(res.outcome).toBe('released_unknown');
      expect((await load(claim.id)).decisionState).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
    });

    it('未过阈值 ⇒ not_stale：不改状态、不写审计行', async () => {
      const claim = await seed({ claimedAt: new Date() });

      const res = await service.release(claim.id, { userId: 'admin-1' }, { note: '提前释放', view: viewOf(claim) });

      expect(res.outcome).toBe('not_stale');
      const row = await load(claim.id);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.OPEN);
      expect(row.releaseReason ?? null).toBeNull();
      expect(await auditRepo().count()).toBe(0);
    });

    it('不是 claimed ⇒ not_claimable（结算 / 已释放的行不能被「释放」）', async () => {
      const settled = await seed({ status: WRITE_CLAIM_STATUS.SETTLED });
      const released = await seed({ status: WRITE_CLAIM_STATUS.RELEASED });

      expect(
        (await service.release(settled.id, { userId: 'admin-1' }, { note: 'x', view: viewOf(settled) })).outcome,
      ).toBe('not_claimable');
      expect(
        (await service.release(released.id, { userId: 'admin-1' }, { note: 'x', view: viewOf(released) })).outcome,
      ).toBe('not_claimable');
      expect(await auditRepo().count()).toBe(0);
    });

    it('不存在 ⇒ not_found；重复释放 ⇒ already_closed（不写第二条审计行）', async () => {
      expect(
        (
          await service.release(999_999, { userId: 'admin-1' }, {
            note: 'x',
            view: { decisionState: WRITE_CLAIM_DECISION_STATE.OPEN, lastLookupId: null },
          })
        ).outcome,
      ).toBe('not_found');

      const claim = await seed();
      expect(
        (await service.release(claim.id, { userId: 'admin-1' }, { note: '第一次', view: viewOf(claim) })).outcome,
      ).toBe('released_unknown');
      // R-4：第二次提交时屏幕若已刷新，它的视图说的是 closed_unknown —— 于是得到 already_closed，
      // 而不是 stale_view。两个答案都对，区别在屏幕有没有跟上账本。
      expect(
        (
          await service.release(claim.id, { userId: 'admin-1' }, {
            note: '第二次',
            view: { decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN, lastLookupId: null },
          })
        ).outcome,
      ).toBe('already_closed');
      expect(await auditRepo().count()).toBe(1);
    });

    it('**释放 ≠ 允许静默重试**：同一幂等键的重占位被拒，且如实报 closed_unknown', async () => {
      const ctx = {
        userId: '7',
        conversationId: 'conv-1',
        toolName: 'send_email',
        args: { to: 'a@example.com' },
      };
      const claim = await seed({ idempotencyKey: buildKey(ctx) });

      await service.release(claim.id, { userId: 'admin-1' }, { note: '无法确认真值', view: viewOf(claim) });

      const store = new WriteClaimStore({} as never, repo());
      const again = await store.claimWrite(ctx);

      expect(again.won).toBe(false);
      expect(again.status).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
      // 行没有因这次重试而复活
      const row = await load(claim.id);
      expect(row.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(row.attempts).toBe(1);
    });

    /**
     * R-4 (F-69 / F-103): the release is bound to the view the reviewer acted on. The case that used
     * to go unnoticed is the sweep moving the row underneath the screen: the conditional update
     * accepted both `open` and `awaiting_decision` — **and** the refusal, when there was one, was
     * generic and left no row. Both halves are asserted here: the ledger does not move, and the refusal
     * is itself a row naming what the screen said versus what the ledger says.
     *
     * R-4（F-69 / F-103）：释放绑定在审阅者当时看到的视图上。此前悄悄过关的那个情形就是清扫把行在屏幕
     * 下面移走：条件更新同时接受 `open` 与 `awaiting_decision` —— **而且**拒绝即便发生，理由也通用、
     * 不留行。这里两半都断言：账本不动，拒绝本身是一行，且写明屏幕说的与账本说的各是什么。
     */
    it('R-4：清扫在视图之下移走该行 ⇒ stale_view，拒绝写成一行，账本一字未动', async () => {
      const claim = await seed();
      const view = viewOf(claim);

      // 屏幕已经打开（视图 = open）；清扫把行移进待裁队列。
      expect((await service.sweepOverdue(60)).moved).toBe(1);
      expect((await load(claim.id)).decisionState).toBe(
        WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
      );

      const res = await service.release(
        claim.id,
        { userId: 'admin-1', username: 'ops-admin' },
        { note: '按屏幕上看到的在途行释放', view },
      );

      expect(res.outcome).toBe('stale_view');
      // 拒绝本身是一行：结果里给出它的 id，且链上只有这一行。
      expect(res.auditRowId).toBeGreaterThan(0);
      const rows = await auditRepo().find({ where: { action: 'claim_release' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(res.auditRowId);
      expect(rows[0].detail).toContain('release refused (stale_view)');
      expect(rows[0].detail).toContain('changed: decisionState');
      expect(rows[0].detail).toContain(`view: decisionState=${WRITE_CLAIM_DECISION_STATE.OPEN}`);
      expect(rows[0].detail).toContain(
        `ledger now: decisionState=${WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION}`,
      );
      expect(rows[0].detail).toContain('按屏幕上看到的在途行释放');
      // 不是一次释放：不带头部结论词，也不带释放证据列（契约：非释放行为空）。
      expect(rows[0].detail).not.toContain('→ closed_unknown');
      expect(rows[0].outcome ?? null).toBeNull();
      expect(rows[0].releaseLookups ?? null).toBeNull();

      // 账本：未被释放 —— 状态、处置、释放原因全部保持原样。
      const row = await load(claim.id);
      expect(row.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION);
      expect(row.releaseReason ?? null).toBeNull();
    });

    it('R-4：视图之后出现新读数 ⇒ stale_view（changed: lastLookup），并留下拒绝行', async () => {
      const claim = await seed();
      const view = viewOf(claim); // 屏幕看到时还没有任何读数
      const reading = await seedLookup(claim.idempotencyKey, new Date('2026-11-22T12:00:00Z'));

      const res = await service.release(
        claim.id,
        { userId: 'admin-1' },
        { note: '屏幕之后目标又被问了一次', view },
      );

      expect(res.outcome).toBe('stale_view');
      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      expect(row.id).toBe(res.auditRowId);
      expect(row.detail).toContain('changed: lastLookup');
      expect(row.detail).toContain('view: decisionState=open, lastLookup=none');
      expect(row.detail).toContain(`lastLookup=#${reading.id}`);
      expect((await load(claim.id)).releaseReason ?? null).toBeNull();
    });

    it('R-4 反证：视图与账本一致 ⇒ 释放成功，链上没有拒绝行', async () => {
      const claim = await seed();
      const reading = await seedLookup(claim.idempotencyKey, new Date('2026-11-22T12:00:00Z'));

      const res = await service.release(
        claim.id,
        { userId: 'admin-1' },
        { note: '视图与账本一致', view: viewOf(claim, reading.id) },
      );

      expect(res.outcome).toBe('released_unknown');
      const rows = await auditRepo().find({ where: { action: 'claim_release' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].detail).not.toContain('refused');
      expect(rows[0].releaseLookups).not.toBeNull();
      expect((await load(claim.id)).decisionState).toBe(
        WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
      );
    });

    it('R-4：陈旧视图的拒绝之后，按刷新后的视图重新提交 ⇒ 正常释放（一行拒绝 + 一行释放）', async () => {
      const claim = await seed();
      const staleView = viewOf(claim);
      await service.sweepOverdue(60);

      expect(
        (await service.release(claim.id, { userId: 'admin-1' }, { note: '陈旧的视图', view: staleView }))
          .outcome,
      ).toBe('stale_view');

      // 刷新后的屏幕读到的就是账本现在的处置。
      const refreshed = viewOf(await load(claim.id));
      expect(
        (await service.release(claim.id, { userId: 'admin-1' }, { note: '刷新后再次提交', view: refreshed }))
          .outcome,
      ).toBe('released_unknown');

      const rows = await auditRepo().find({
        where: { action: 'claim_release' },
        order: { id: 'ASC' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].detail).toContain('release refused (stale_view)');
      expect(rows[1].detail).toContain('→ closed_unknown');
    });

    it('R-4：视图之后行被别人释放 ⇒ stale_view（不再是一个通用理由，也留了行）', async () => {
      const claim = await seed();
      const view = viewOf(claim);
      await service.release(claim.id, { userId: 'admin-2' }, { note: '另一位管理员先释放了', view });

      const res = await service.release(
        claim.id,
        { userId: 'admin-1' },
        { note: '同一块屏幕上的第二次提交', view },
      );

      expect(res.outcome).toBe('stale_view');
      const rows = await auditRepo().find({ where: { action: 'claim_release' } });
      expect(rows).toHaveLength(2);
      const refusal = rows.find((r) => r.userId === 'admin-1')!;
      expect(refusal.detail).toContain('release refused (stale_view)');
      expect(refusal.detail).toContain(
        `ledger now: decisionState=${WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN}`,
      );
    });
  });

  describe('F-64 过期 / 决策策略', () => {
    it('滞留 open ⇒ 转入待裁队列；状态与结论一字不动；不写审计行', async () => {
      const stale = await seed();
      const fresh = await seed({ claimedAt: new Date() });

      const res = await service.sweepOverdue(60);

      expect(res.moved).toBe(1);
      const moved = await load(stale.id);
      expect(moved.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION);
      // 到期只是「窗口结束」，不是释放：状态仍是 claimed，结论仍未知
      expect(moved.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(moved.releaseReason ?? null).toBeNull();
      expect((await load(fresh.id)).decisionState).toBe(WRITE_CLAIM_DECISION_STATE.OPEN);
      expect(await auditRepo().count()).toBe(0);

      // 它进入了待裁队列，仍在「未关闭」的在途视图里（到期不等于消失，更不等于释放）
      const queue = await query().list({ decisionState: 'awaiting_decision' });
      expect(queue.total).toBe(1);
      expect(queue.items[0].id).toBe(stale.id);
      expect((await query().list({})).total).toBe(2);
    });

    it('结算 / 已释放 / 已关闭的行不进入队列（只扫仍是 claimed + open 的行）', async () => {
      const settled = await seed({ status: WRITE_CLAIM_STATUS.SETTLED });
      const released = await seed({ status: WRITE_CLAIM_STATUS.RELEASED });
      const closed = await seed({ decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN });
      const already = await seed({ decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION });

      expect((await service.sweepOverdue(60)).moved).toBe(0);

      expect((await load(settled.id)).decisionState).toBe(WRITE_CLAIM_DECISION_STATE.OPEN);
      expect((await load(released.id)).decisionState).toBe(WRITE_CLAIM_DECISION_STATE.OPEN);
      expect((await load(closed.id)).decisionState).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
      expect((await load(already.id)).decisionState).toBe(WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION);
    });

    it('过期**不是**静默释放：重占位仍被拒（键仍被占住）', async () => {
      const ctx = {
        userId: '7',
        conversationId: 'conv-1',
        toolName: 'send_email',
        args: { to: 'a@example.com' },
      };
      await seed({ idempotencyKey: buildKey(ctx) });

      await service.sweepOverdue(60);

      const store = new WriteClaimStore({} as never, repo());
      const again = await store.claimWrite(ctx);
      expect(again.won).toBe(false);
      expect(again.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    });
  });

  describe('R-6 第三个桶：问不了 ≠ 没人问', () => {
    it('无状态端点的工具上释放 ⇒ 行内写「问不了」，链外列 askable=false，而不是「从未问过」', async () => {
      const claim = await seed({ toolName: 'proxy_send_payout' });

      const res = await serviceWithProbe(false).release(
        claim.id,
        { userId: 'admin-1' },
        { note: '该工具没有状态端点', view: viewOf(claim) },
      );

      expect(res.outcome).toBe('released_unknown');
      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      // 三态里的第三态：工具连问都问不了 —— 不能与「可以问、但没人去问」同形。
      expect(row.detail).toContain('lookups: none (not askable');
      expect(row.detail).toContain('no usable status query');
      expect(row.detail).not.toContain('never queried');
      // 同一事实以字段落进链外列，三态因此可计数。
      expect(JSON.parse(row.releaseLookups!)).toEqual({ count: 0, askable: false, items: [] });
    });

    it('可问但没问 ⇒ 仍是「从未问过」，链外列 askable=true（三态第二态）', async () => {
      const claim = await seed({ toolName: 'proxy_send_payout' });

      const res = await serviceWithProbe(true).release(
        claim.id,
        { userId: 'admin-1' },
        { note: '没人来得及查', view: viewOf(claim) },
      );

      expect(res.outcome).toBe('released_unknown');
      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      expect(row.detail).toContain('lookups: none (never queried)');
      expect(row.detail).not.toContain('not askable');
      expect(JSON.parse(row.releaseLookups!)).toEqual({ count: 0, askable: true, items: [] });
    });

    it('探针缺席 ⇒ 不臆断可问性：askable=null，措辞退回只陈述次数', async () => {
      const claim = await seed();

      await service.release(claim.id, { userId: 'admin-1' }, { note: '装配里没有探针', view: viewOf(claim) });

      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      expect(row.detail).toContain('lookups: none (never queried)');
      expect(row.detail).not.toContain('not askable');
      expect(JSON.parse(row.releaseLookups!).askable).toBeNull();
    });

    it('问过 N 次 ⇒ 计数优先；即便工具当前已不可问，读数仍是「问过 N 次」', async () => {
      const claim = await seed({ toolName: 'proxy_send_payout' });
      const reading = await seedLookup(claim.idempotencyKey, new Date('2026-11-24T10:00:00Z'));

      const res = await serviceWithProbe(false).release(
        claim.id,
        { userId: 'admin-1' },
        { note: '配置已改，但确实问过', view: viewOf(claim, reading.id) },
      );

      expect(res.outcome).toBe('released_unknown');
      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      expect(row.detail).toContain('lookups: 1 asked (see releaseLookups)');
      const evidence = JSON.parse(row.releaseLookups!) as { count: number; askable: boolean | null };
      expect(evidence.count).toBe(1);
      // 可问性是**写入时刻**的工具性质；次数记的是**发生过什么** —— 两者都如实保留。
      expect(evidence.askable).toBe(false);
    });
  });

  /**
   * R-3 follow-up (F-123–F-127): the copied readings must be **resolvable**, **honest**, and **one
   * snapshot**.
   *
   * The copy is the boundary of the history, not the history: the count plus the newest three, and the
   * newest id is the watermark. It stays honest by construction only if three things hold, and each is
   * pinned below: every copied entry equals the row it names (by id, read back from the table), no
   * derived field grows in the copy (a whitelist on the key set), and the count and items come from a
   * single statement rather than two reads that a concurrent ask could split.
   *
   * R-3 后续（F-123–F-127）：所拷贝的读数必须**可解析**、**诚实**、**出自同一快照**。
   *
   * 拷贝是历史的边界而非历史本身：总数加最近三条，最新一条的 id 即水位。它只在三件事成立时靠构造
   * 保持诚实，每一件都在下面钉住：每条拷贝等于它点名的那一行（按 id 回表读回）、拷贝里不长出派生字段
   * （键集白名单）、次数与条目出自一条语句而不是两次读（后者会被并发的询问劈开）。
   */
  describe('R-3 后续（F-123–F-127）：拷贝可解析、单快照、水位', () => {
    type CopiedEntry = {
      id: number;
      at: string;
      conclusion: string;
      reason: string | null;
      basis: string;
      lookedUpBy: string;
    };

    it('F-123/F-124：每条拷贝带读数行 id，按 id 回查即那条源行；F-125：键集被白名单钉住', async () => {
      const claim = await seed();
      // One recorded kind and one not: the source's real `basis` must reach its copy, not be flattened
      // to `unknown` by the merged select.
      //
      // 一条记了种类、一条没记：源行真实的 `basis` 必须原样出现在它的拷贝里，不能一律写成 `unknown`。
      const first = await seedLookup(claim.idempotencyKey, new Date('2026-11-22T10:00:00Z'), {
        basis: 'receipt',
      });
      const second = await seedLookup(claim.idempotencyKey, new Date('2026-11-22T12:00:00Z'), {
        conclusion: 'unknown',
        reason: 'non_2xx',
        lookedUpBy: 'system:sweep',
      });

      const res = await service.release(
        claim.id,
        { userId: 'admin-1' },
        { note: '问过两次', view: viewOf(claim, second.id) },
      );
      expect(res.outcome).toBe('released_unknown');

      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      const structured = JSON.parse(row.releaseLookups!) as {
        count: number;
        askable: boolean | null;
        items: CopiedEntry[];
      };

      // 最近在前；id 就是拷贝的锚。
      expect(structured.items.map((i) => i.id)).toEqual([second.id, first.id]);

      // ① 每条拷贝等于它点名的那条读数行 —— 不信拷贝自身，回表按 id 读回。
      for (const item of structured.items) {
        const source = await lookups().findOneByOrFail({ id: item.id });
        expect(item).toEqual({
          id: source.id,
          at: source.at.toISOString(),
          conclusion: source.conclusion,
          reason: source.reason ?? null,
          // R-1 (merged here): the reading's kind travels with the copy, `unknown` when not recorded.
          // R-1（并入）：读数的种类随拷贝一起走，未记录时记 `unknown`。
          basis: source.basis ?? 'unknown',
          lookedUpBy: source.lookedUpBy,
        });
      }

      // ② 拷贝不得含派生 / 计算字段：键集白名单，多一个就红（判断只在源行与等级里有一处家）。
      for (const item of structured.items) {
        expect(Object.keys(item).sort()).toEqual([
          'at',
          'basis',
          'conclusion',
          'id',
          'lookedUpBy',
          'reason',
        ]);
      }
      expect(Object.keys(structured).sort()).toEqual(['askable', 'count', 'items']);
    });

    it('F-127：count 与最近三条出自**一条 SQL**（同一快照），不是两次读再凑', async () => {
      const claim = await seed();
      const seeded: TargetStatusLookupRow[] = [];
      for (let i = 0; i < 5; i += 1) {
        seeded.push(
          await seedLookup(claim.idempotencyKey, new Date(Date.UTC(2026, 10, 22, 10 + i))),
        );
      }
      const newest = seeded[seeded.length - 1];

      sqlStatements.length = 0;
      const res = await service.release(
        claim.id,
        { userId: 'admin-1' },
        { note: '问过五次', view: viewOf(claim, newest.id) },
      );
      expect(res.outcome).toBe('released_unknown');

      // 只读一次读表：两次读（count 后再 find）会让并发的自动询问落进缝里，行与自己差一。
      const reads = sqlStatements.filter(
        (q) => /^\s*select/i.test(q) && /ai_target_status_lookups/i.test(q),
      );
      expect(reads).toHaveLength(1);
      // 窗口计数在 LIMIT 之前求值 ⇒ 同一条语句既给全集数、又给它的最新尾部。
      expect(reads[0]).toContain('COUNT(*) OVER ()');

      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      const structured = JSON.parse(row.releaseLookups!) as {
        count: number;
        items: CopiedEntry[];
      };
      // The prose carries the count and nothing else — the same wording at every count, because the
      // readings live in the structured column. Nothing here spells out "k of N".
      // 散文只装次数，措辞不随次数变 —— 读数在结构化列里；这里不会出现「k of N」。
      expect(row.detail).toContain('lookups: 5 asked (see releaseLookups)');
      expect(row.detail).not.toContain('newest first');
      // 计数覆盖全集，条目是同一集合的最新三条 —— 两者自洽。
      expect(structured.count).toBe(5);
      expect(structured.items.map((i) => i.id)).toEqual(
        seeded
          .slice(-3)
          .reverse()
          .map((l) => l.id),
      );
    });

    it('F-127 水位：最新一条拷贝的 id 即水位 —— 其后写入的读数 id 更大，决定行一字不改', async () => {
      const claim = await seed();
      const reading = await seedLookup(claim.idempotencyKey, new Date('2026-11-22T12:00:00Z'));
      await service.release(
        claim.id,
        { userId: 'admin-1' },
        { note: '问过一次', view: viewOf(claim, reading.id) },
      );

      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      const decision = JSON.parse(row.releaseLookups!) as { count: number; items: CopiedEntry[] };
      const watermark = decision.items[0].id;
      expect(watermark).toBe(reading.id);

      // 决定之后写入的读数：id 更大 ⇒ 它不在这次决定看见的边界里。
      const later = await seedLookup(claim.idempotencyKey, new Date('2026-11-23T12:00:00Z'), {
        conclusion: 'unknown',
        reason: 'timeout',
      });
      expect(later.id).toBeGreaterThan(watermark);

      // 决定行记的是决定当时看见什么；事后写入的读数不改写它（源表仅追加，故 id 不会重号）。
      const after = await auditRepo().findOneByOrFail({ id: row.id });
      expect(after.releaseLookups).toBe(row.releaseLookups);
      expect(JSON.parse(after.releaseLookups!).count).toBe(1);
    });

    it('两读面对得上：屏幕上冻结的 `lastLookup.id` 就是释放行的水位，拷贝的每个 id 都能在历史读面按同值找到', async () => {
      const claim = await seed();
      await seedLookup(claim.idempotencyKey, new Date('2026-11-22T10:00:00Z'), {
        basis: 'receipt',
      });
      const second = await seedLookup(claim.idempotencyKey, new Date('2026-11-22T12:00:00Z'), {
        conclusion: 'unknown',
        reason: 'timeout',
        lookedUpBy: 'system:sweep',
      });

      // The frozen view comes from the list read face itself, not an id assembled here: this test is
      // about the same number on both surfaces.
      // 冻结视图取自列表读面本身，而不是测试另拼一个 id —— 这条用例要证的是两面同号。
      const readFace = new WriteClaimQueryService(repo(), lookups(), undefined);
      const listed = await readFace.list(
        { decisionState: 'all' },
        { userId: 1, role: UserRole.ADMIN },
      );
      const onScreen = listed.items.find((r) => r.id === claim.id)!;
      expect(onScreen.lastLookup?.id).toBe(second.id);

      const res = await service.release(
        claim.id,
        { userId: 'admin-1' },
        {
          note: '按屏幕冻结的读数释放',
          view: {
            decisionState: onScreen.decisionState,
            lastLookupId: onScreen.lastLookup?.id ?? null,
          },
        },
      );
      expect(res.outcome).toBe('released_unknown');

      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      const copy = JSON.parse(row.releaseLookups!) as { items: CopiedEntry[] };
      // The watermark is the id the screen froze, so the two surfaces agree without inferring order
      // from timestamps.
      // 水位 = 屏幕上冻结的那条 ⇒ 两读面同一个 id，不需要靠时间戳猜先后。
      expect(copy.items[0].id).toBe(onScreen.lastLookup?.id);

      // The second read face (history): every copied id is on it, with identical observed values.
      // 第二条读面（历史）：拷贝的每个 id 都在上面，且观测字段逐一同值。
      const history = await readFace.lookupsFor(claim.id, {
        userId: 1,
        role: UserRole.ADMIN,
      });
      expect(history).not.toBeNull();
      for (const item of copy.items) {
        const shown = history!.items.find((l) => l.id === item.id);
        expect(shown).toBeTruthy();
        expect({
          at: shown!.at,
          conclusion: shown!.conclusion,
          reason: shown!.reason,
          basis: shown!.basis,
          lookedUpBy: shown!.lookedUpBy,
        }).toEqual({
          at: item.at,
          conclusion: item.conclusion,
          reason: item.reason,
          basis: item.basis,
          lookedUpBy: item.lookedUpBy,
        });
      }
    });
  });

  /**
   * R-6b: the target-driven path with its evidence row missing. `_recordLookup` swallows a failed
   * insert by design (the ledger's move rests on the target's answer, not on the evidence table), so
   * this row can legitimately have `count = 0` while the same `detail` says the target answered.
   * "Never queried" there would contradict the row itself; the manual path keeps it, because there a
   * zero truly means nobody asked.
   *
   * R-6b：目标驱动路径遇上证据行缺失。`_recordLookup` 按设计会吞掉插入失败（账的移动由目标的回答支撑，
   * 不由证据表），于是这一行可能 `count = 0`，而同一段 `detail` 却说目标答过。此时「从未问过」会与这一
   * 行自相矛盾；人工路径沿用该措辞，因为那里的零次确实意味着没人问过。
   */
  describe('R-6b 目标驱动：目标答过但读数行缺失', () => {
    const trigger = {
      byUserId: 'system:sweep',
      automatic: true,
      conclusion: 'not_executed' as const,
      queryMethod: 'GET',
      queryPath: '/actions/status',
      queriedAt: '2026-11-25T00:00:00.000Z',
    };

    it('读数行缺失 ⇒ 不写「从未问过」，写明记录缺失；链外列 recorded=false', async () => {
      const claim = await seed();
      // The lookup table is empty, so `count` / `find` return 0 — what a swallowed insert leaves
      // behind. The probe says askable, so "asked but not recorded" must win over "askable, not asked".
      //
      // 读数表为空：count / find 都返回 0，正是插入被吞掉之后的样子。探针可问为 true，确保
      // 「问过但记录缺失」优先于「可问但没问」，不会退回第二态。
      const auditRowId = await serviceWithProbe(true).recordTargetRelease(claim, trigger, false);

      const row = await auditRepo().findOneByOrFail({ id: auditRowId });
      expect(row.action).toBe('claim_release');
      expect(row.detail).toContain('origin: target answered not_executed');
      expect(row.detail).toContain('lookup record missing');
      expect(row.detail).toContain('the target was asked, the lookup row was not recorded');
      expect(row.detail).not.toContain('never queried');
      // The same fact as data: a missing lookup row is readable and countable, not prose-only.
      //
      // 同一事实以字段落进链外列：读数行缺失是可读、可计数的，而不是只剩一句散文。
      expect(JSON.parse(row.releaseLookups!)).toEqual({
        count: 0,
        askable: true,
        recorded: false,
        items: [],
      });
    });

    it('人工释放 count=0 ⇒ 仍是「从未问过」，链外列不带 recorded（对照）', async () => {
      const claim = await seed();

      await serviceWithProbe(true).release(
        claim.id,
        { userId: 'admin-1' },
        { note: '没有人问过', view: viewOf(claim) },
      );

      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      expect(row.detail).toContain('lookups: none (never queried)');
      expect(row.detail).not.toContain('lookup record missing');
      // On the manual path zero really is "nobody asked"; the column is unchanged and the three
      // states stay distinguishable (no `recorded` field).
      //
      // 人工路径零次就是真的没人问 —— 链外列形状不变，三态仍可区分（无 recorded 字段）。
      expect(JSON.parse(row.releaseLookups!)).toEqual({ count: 0, askable: true, items: [] });
    });
  });

  /**
   * The six-answer export's Initiated-by cell reads `username`; a target-driven release written
   * without it said «Not recorded» even when a person initiated. The snapshot now travels beside the
   * id, while the automatic pass keeps none — its actor kind is read from the id, not invented as a
   * name.
   *
   * 六问导出的「发起人」列读 `username`；此前由人发起的目标驱动释放也因没有它而说「未记录」。快照现在
   * 与 id 并列落库，而自动清扫仍然没有 —— 它的主体种类从 id 读出，不编一个名字。
   */
  it('目标驱动释放：人发起时带 username 快照，自动清扫不带', async () => {
    const trigger = (byUserId: string, byUsername?: string, automatic = false) => ({
      byUserId,
      byUsername,
      automatic,
      conclusion: 'not_executed' as const,
      queryMethod: 'GET',
      queryPath: '/actions/status',
      queriedAt: '2026-11-25T00:00:00.000Z',
    });

    const manualClaim = await seed();
    // No lookup rows here, so this ask's row is missing — the boolean states what the table shows.
    // 这里没有读数行，故这一次的行缺失 —— 布尔值陈述的正是表里的样子。
    const manualId = await serviceWithProbe(true).recordTargetRelease(
      manualClaim,
      trigger('7', 'audit_admin'),
      false,
    );
    const manualRow = await auditRepo().findOneByOrFail({ id: manualId });
    expect(manualRow.userId).toBe('7');
    expect(manualRow.username).toBe('audit_admin');

    const sweepClaim = await seed();
    const sweepId = await serviceWithProbe(true).recordTargetRelease(
      sweepClaim,
      trigger('system:sweep', undefined, true),
      false,
    );
    const sweepRow = await auditRepo().findOneByOrFail({ id: sweepId });
    expect(sweepRow.userId).toBe('system:sweep');
    expect(sweepRow.username).toBeNull();
  });
});

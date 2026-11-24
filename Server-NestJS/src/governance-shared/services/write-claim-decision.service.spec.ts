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

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiWriteClaim, AiAuditLog, TargetStatusLookupRow],
      synchronize: true,
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

  describe('F-63 释放程序', () => {
    it('滞留占位：释放 = 转入 closed_unknown、**状态仍 claimed**、审计行落库且不带结论词', async () => {
      const claim = await seed();

      const res = await service.release(
        claim.id,
        { userId: 'admin-1', username: 'ops-admin' },
        { note: '目标不可达；票据 OPS-7 已确认目标无此记录', evidenceRef: 'OPS-7' },
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
      await seedLookup(claim.idempotencyKey, new Date('2026-11-22T12:00:00Z'));

      const res = await service.release(
        claim.id,
        { userId: 'admin-1', username: 'ops-admin' },
        { note: '两次目标查询都说没执行，键仍保留' },
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

      const res = await service.release(claim.id, { userId: 'admin-1' }, { note: '目标无状态端点，直接释放' });

      expect(res.outcome).toBe('released_unknown');
      const row = await auditRepo().findOneByOrFail({ action: 'claim_release' });
      expect(row.detail).toContain('lookups: none (never queried)');
      // 没有查询读数，就不能出现任何结论词 —— 空历史不是答案。
      expect(row.detail).not.toMatch(/executed/);
      // 结构化列仍写出来，但为空列表：读的人看到的是「问过 0 次」，不是「这一列没有」。
      expect(JSON.parse(row.releaseLookups!)).toEqual({ count: 0, items: [] });
    });

    it('F-85b：证据读取失败 ⇒ 状态未改、无审计行（读取在条件更新之前）', async () => {
      const claim = await seed();
      const failing = new WriteClaimDecisionService(
        repo(),
        {
          count: async () => {
            throw new Error('lookup store down');
          },
        } as never,
        audit,
        { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? 60 : undefined) } as never,
      );

      await expect(
        failing.release(claim.id, { userId: 'admin-1' }, { note: '读取应失败' }),
      ).rejects.toThrow('lookup store down');

      // 读在更新之前：失败时这条路径什么都没留下 —— 没有「有决定、无记录」的账。
      const row = await load(claim.id);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.OPEN);
      expect(row.releaseReason ?? null).toBeNull();
      expect(await auditRepo().count()).toBe(0);
    });

    it('待裁队列里的行可以被释放（队列可处置）', async () => {
      const claim = await seed({ decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION });

      const res = await service.release(claim.id, { userId: 'admin-1' }, { note: '已核对，无法定论' });

      expect(res.outcome).toBe('released_unknown');
      expect((await load(claim.id)).decisionState).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
    });

    it('未过阈值 ⇒ not_stale：不改状态、不写审计行', async () => {
      const claim = await seed({ claimedAt: new Date() });

      const res = await service.release(claim.id, { userId: 'admin-1' }, { note: '提前释放' });

      expect(res.outcome).toBe('not_stale');
      const row = await load(claim.id);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.OPEN);
      expect(row.releaseReason ?? null).toBeNull();
      expect(await auditRepo().count()).toBe(0);
    });

    it('不是 claimed ⇒ not_claimable（结算 / 已释放的行不能被「释放」）', async () => {
      const settled = await seed({ status: WRITE_CLAIM_STATUS.SETTLED });
      const released = await seed({ status: WRITE_CLAIM_STATUS.RELEASED });

      expect((await service.release(settled.id, { userId: 'admin-1' }, { note: 'x' })).outcome).toBe(
        'not_claimable',
      );
      expect((await service.release(released.id, { userId: 'admin-1' }, { note: 'x' })).outcome).toBe(
        'not_claimable',
      );
      expect(await auditRepo().count()).toBe(0);
    });

    it('不存在 ⇒ not_found；重复释放 ⇒ already_closed（不写第二条审计行）', async () => {
      expect((await service.release(999_999, { userId: 'admin-1' }, { note: 'x' })).outcome).toBe(
        'not_found',
      );

      const claim = await seed();
      expect((await service.release(claim.id, { userId: 'admin-1' }, { note: '第一次' })).outcome).toBe(
        'released_unknown',
      );
      expect((await service.release(claim.id, { userId: 'admin-1' }, { note: '第二次' })).outcome).toBe(
        'already_closed',
      );
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

      await service.release(claim.id, { userId: 'admin-1' }, { note: '无法确认真值' });

      const store = new WriteClaimStore({} as never, repo());
      const again = await store.claimWrite(ctx);

      expect(again.won).toBe(false);
      expect(again.status).toBe(WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN);
      // 行没有因这次重试而复活
      const row = await load(claim.id);
      expect(row.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(row.attempts).toBe(1);
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
});

// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import {
  AiWriteClaim,
  WRITE_CLAIM_DECISION_STATE,
  WRITE_CLAIM_STATUS,
} from '../entities/ai-write-claim.entity';
import { TargetStatusLookupRow } from '../entities/target-status-lookup.entity';
import { UserRole } from '../../common/entities/user.entity';
import { WriteClaimQueryService } from './write-claim-query.service';

/**
 * AW-16：**某时刻哪些调用在途** —— 只读查询面。
 *
 * 为什么必须是真的数据库：这张面回答的是「查询那一刻表里还是 `claimed` 的行」——
 * 过滤、时间窗与陈旧判据都是 SQL 与时间的事，用替身测等于测替身写好的答案。
 *
 * **对旧实现为红**：此前没有任何按用户/工具/时间窗列 `claimed` 行的读侧实现，
 * `effect-projection.ts` 里只有 `/ai/tool-effects?stale=true` 附带的**陈旧子集**，且不带 `args_hash`。
 * 故下面第 1、2 条在旧实现下无处可跑。
 */
describe('AW-16 在途 claim 只读查询面', () => {
  let ds: DataSource;
  let orgService: { getUserOrgContext: jest.Mock } | undefined;
  let service: WriteClaimQueryService;

  const repo = () => ds.getRepository(AiWriteClaim);
  const lookups = () => ds.getRepository(TargetStatusLookupRow);

  /**
   * AW-17: a stand-in for the B-path probe. It answers only the one question the read side asks —
   * "does this tool have a status query configured?" — because a false answer must render as
   * "cannot ask", not as "asked and got nothing".
   *
   * AW-17：B 路径探针的替身。它只回答读侧要问的那一件事 ——「这个工具配了状态查询吗？」——
   * 因为否定的答案必须渲染成「问不了」，而不是「问了没结果」。
   */
  let probe: { canAsk: jest.Mock };

  /** 只造查询面看得懂的字段；`args` 从来就不在表里（表里只有 args_hash） */
  const claim = (over: Partial<AiWriteClaim> & { idempotencyKey: string }) =>
    repo().save(
      repo().create({
        userId: '7',
        toolName: 'create_followup',
        argsHash: '0123456789abcdef',
        status: WRITE_CLAIM_STATUS.CLAIMED,
        claimedAt: new Date(),
        attempts: 1,
        ...over,
      }),
    );

  const build = (thresholdMinutes?: number): WriteClaimQueryService =>
    new WriteClaimQueryService(
      repo(),
      lookups(),
      { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? thresholdMinutes : undefined) } as never,
      orgService as never,
      probe as never,
    );

  const lookup = (key: string, over: Partial<TargetStatusLookupRow> = {}) =>
    lookups().save(
      lookups().create({
        idempotencyKey: key,
        toolName: 'proxy_send',
        lookedUpBy: 'admin-1',
        asUserId: '7',
        queryMethod: 'GET',
        queryPath: `/actions/${key}`,
        conclusion: 'unknown',
        reason: 'timeout',
        ...over,
      }),
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiWriteClaim, TargetStatusLookupRow],
      synchronize: true,
    });
    await ds.initialize();
    // 组织范围用的联接形状与审计读侧同源（`org_members`）；本用例表由这里手工建出，
    // 使「组织快照来自账号」这条判定在真实 SQL 上成立，而不是靠替身断言。
    await ds.query('CREATE TABLE org_members (user_id integer NOT NULL, org_id integer NOT NULL)');
    orgService = undefined;
    // Default: no tool is answerable — the honest default is "cannot ask", never "did not run".
    // 默认：没有工具可问 —— 诚实的默认是「问不了」，绝不是「没执行」。
    probe = { canAsk: jest.fn(() => false) };
    service = build();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('列出 claimed 行：带工具名与 args_hash，且**没有任何参数明文**', async () => {
    await claim({ idempotencyKey: 'k1' });

    const res = await service.list({});

    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
    const row = res.items[0];
    expect(row.toolName).toBe('create_followup');
    expect(row.argsHash).toBe('0123456789abcdef');
    expect(row.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
    expect(row.userId).toBe('7');
    // 参数明文在这张表里根本不存在 —— 断言字段集，防止日后有人「顺手」把 args 塞进投影。
    expect(Object.keys(row).sort()).toEqual(
      [
        'ageMinutes',
        'agentId',
        'argsHash',
        'attempts',
        'authorizationRef',
        'autoReconcileDueAt',
        'autoReconcileStopped',
        'claimedAt',
        'conversationId',
        'decidedRole',
        'decisionState',
        'id',
        'lastLookup',
        'lookupCount',
        'policyRevision',
        'reconcilable',
        'runId',
        'stale',
        'status',
        'toolName',
        'userId',
      ].sort(),
    );
    // 幂等键是 userId:conv:tool:args 的 sha256，但仍不出现在这一面：本面要的是「哪个工具、哪次参数摘要」。
    expect(JSON.stringify(row)).not.toContain('idempotency');
  });

  it('反向：落定 / 释放后从列表消失（只有仍在 `claimed` 的调用才算「在途」）', async () => {
    const settled = await claim({ idempotencyKey: 'settled', toolName: 'create_todo' });
    const released = await claim({ idempotencyKey: 'released', toolName: 'create_todo' });
    await claim({ idempotencyKey: 'running', toolName: 'send_email' });

    const before = await service.list({});
    expect(before.items.map((r) => r.toolName).sort()).toEqual([
      'create_todo',
      'create_todo',
      'send_email',
    ]);

    await repo().update(settled.id, {
      status: WRITE_CLAIM_STATUS.SETTLED,
      settledAt: new Date(),
    });
    await repo().update(released.id, {
      status: WRITE_CLAIM_STATUS.RELEASED,
      releaseReason: 'execute_failed',
    });

    const after = await service.list({});
    expect(after.total).toBe(1);
    expect(after.items.map((r) => r.toolName)).toEqual(['send_email']);
  });

  it('按用户 / 工具 / 时间窗过滤，且时间窗两端闭合', async () => {
    const old = new Date('2026-11-01T00:00:00Z');
    const mid = new Date('2026-11-02T00:00:00Z');
    const recent = new Date('2026-11-03T00:00:00Z');
    await claim({ idempotencyKey: 'a', userId: '7', toolName: 'create_todo', claimedAt: old });
    await claim({ idempotencyKey: 'b', userId: '8', toolName: 'create_todo', claimedAt: mid });
    await claim({ idempotencyKey: 'c', userId: '7', toolName: 'send_email', claimedAt: recent });

    expect((await service.list({ userId: '7' })).total).toBe(2);
    expect((await service.list({ toolName: 'create_todo' })).total).toBe(2);
    const windowed = await service.list({ since: mid, until: recent });
    expect(windowed.items.map((r) => r.userId).sort()).toEqual(['7', '8']);
  });

  it('滞留判据与 `listStaleClaims` 同一阈值：老行标 stale，新行不标；staleOnly 只留老的', async () => {
    service = build(30);
    await claim({
      idempotencyKey: 'old',
      claimedAt: new Date(Date.now() - 45 * 60_000),
    });
    await claim({ idempotencyKey: 'fresh', claimedAt: new Date() });

    const all = await service.list({});
    expect(all.thresholdMinutes).toBe(30);
    expect(all.items.map((r) => [r.stale, r.stale ? 'old' : 'fresh'])).toEqual([
      [true, 'old'],
      [false, 'fresh'],
    ]);
    // `stale` 是判据，不是状态改写：老行仍如实留在 claimed（读不自动解决）
    expect(all.items[0].ageMinutes).toBeGreaterThanOrEqual(45);
    expect(all.items[0].status).toBe(WRITE_CLAIM_STATUS.CLAIMED);

    const staleOnly = await service.list({ staleOnly: true });
    expect(staleOnly.items).toHaveLength(1);
    expect(staleOnly.items[0].stale).toBe(true);
    expect(staleOnly.total).toBe(1);
  });

  it('范围：管理员看全量；审计读者无组织 ⇒ 只看本人；有组织 ⇒ 只看同组织（收紧不放宽）', async () => {
    await claim({ idempotencyKey: 'own', userId: '7' });
    await claim({ idempotencyKey: 'peer', userId: '8' });
    await claim({ idempotencyKey: 'outsider', userId: '9' });

    const admin = await service.list({}, { userId: 7, role: UserRole.ADMIN });
    expect(admin.scope).toBe('all');
    expect(admin.total).toBe(3);

    const noOrg = await service.list({}, { userId: 7, role: UserRole.AUDITOR });
    expect(noOrg.scope).toBe('own');
    expect(noOrg.items.map((r) => r.userId)).toEqual(['7']);

    // 账号范围（组织）来自 OrgService；请求侧过滤只能再收紧
    await ds.query('INSERT INTO org_members (user_id, org_id) VALUES (7, 5), (8, 5), (9, 6)');
    orgService = { getUserOrgContext: jest.fn().mockResolvedValue({ orgId: 5 }) };
    service = build();

    const org = await service.list({}, { userId: 7, role: UserRole.AUDITOR });
    expect(org.scope).toBe('org');
    expect(org.items.map((r) => r.userId).sort()).toEqual(['7', '8']);

    // 请求里点名组织外的人 ⇒ 交集为空，而不是用请求替换账号范围
    const narrowed = await service.list({ userId: '9' }, { userId: 7, role: UserRole.AUDITOR });
    expect(narrowed.total).toBe(0);
  });

  it('顺序：按 claimedAt 升序、并列时 id 升序决序（分页成员因此确定）', async () => {
    const t1 = new Date('2026-11-01T00:00:00Z');
    const t2 = new Date('2026-11-02T00:00:00Z');
    await claim({ idempotencyKey: 'same-a', claimedAt: t2 });
    await claim({ idempotencyKey: 'same-b', claimedAt: t2 });
    const early = await claim({ idempotencyKey: 'early', claimedAt: t1 });

    const res = await service.list({});
    const ids = res.items.map((r) => r.id);
    expect(ids[0]).toBe(early.id);
    expect(ids.slice(1)).toEqual([...ids.slice(1)].sort((x, y) => x - y));
  });

  /**
   * AW-15's two columns reach this surface too. A null reading is reported as the word `unknown` —
   * the same reading the effects list already gives — because "not recorded" is not "no role" and
   * must not be backfilled with a guess.
   *
   * AW-15 的两列也进这一面。缺读报成 `unknown` —— 与副作用列表同一读数 —— 因为「没记下」不是
   * 「没有角色」，也不能被回填成猜测。
   */
  it('AW-15 两列进投影：缺读报 unknown，有值原样读出', async () => {
    await claim({ idempotencyKey: 'legacy' });
    await claim({
      idempotencyKey: 'new',
      decidedRole: 'admin',
      policyRevision: 'rev-frozen-9',
    });

    const res = await service.list({});
    const legacy = res.items.find((r) => r.status === WRITE_CLAIM_STATUS.CLAIMED && r.decidedRole === 'unknown')!;
    expect(legacy).toBeDefined();
    expect(legacy.policyRevision).toBe('unknown');

    const recorded = res.items.find((r) => r.decidedRole === 'admin')!;
    expect(recorded.policyRevision).toBe('rev-frozen-9');
  });

  /**
   * F-64: a released hold leaves the in-flight view but stays on the ledger as `claimed`; the
   * pending-decision queue is a filter, not a second list. `all` is the only reading that includes
   * closed rows — and even then it never invents a conclusion.
   *
   * F-64：已释放的占位离开在途视图，但在账上仍是 `claimed`；待裁队列是一个过滤器、不是第二张表。
   * 只有 `all` 读得到已关闭行 —— 即便读到，也不凭空造结论。
   */
  it('F-64 决策状态：默认不含已关闭；待裁可单独查；all 才包含已关闭', async () => {
    await claim({ idempotencyKey: 'open', decisionState: WRITE_CLAIM_DECISION_STATE.OPEN });
    await claim({
      idempotencyKey: 'awaiting',
      decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
    });
    await claim({
      idempotencyKey: 'closed',
      decisionState: WRITE_CLAIM_DECISION_STATE.CLOSED_UNKNOWN,
    });

    const inFlight = await service.list({});
    expect(inFlight.items.map((r) => r.decisionState)).toEqual(['open', 'awaiting_decision']);

    const queue = await service.list({ decisionState: 'awaiting_decision' });
    expect(queue.items.map((r) => r.decisionState)).toEqual(['awaiting_decision']);
    expect(queue.items[0].status).toBe(WRITE_CLAIM_STATUS.CLAIMED);

    const open = await service.list({ decisionState: 'open' });
    expect(open.items.map((r) => r.decisionState)).toEqual(['open']);

    const all = await service.list({ decisionState: 'all' });
    expect(all.total).toBe(3);
    expect(all.items.map((r) => r.decisionState).sort()).toEqual([
      'awaiting_decision',
      'closed_unknown',
      'open',
    ]);
  });

  describe('AW-17：目标状态查询的读数（没问过 ≠ 问了没答 ≠ 执行过）', () => {
    it('没有查询记录 ⇒ `lastLookup` 为 `null`（列表该显示「未查询」，不是「已执行」）', async () => {
      probe.canAsk.mockImplementation((toolName: string) => toolName === 'proxy_send');
      await claim({ idempotencyKey: 'never-asked', toolName: 'proxy_send' });

      const res = await service.list({});

      expect(res.items[0].lastLookup).toBeNull();
      expect(res.items[0].reconcilable).toBe(true);
    });

    it('问了没答 ⇒ `unknown` 与成因原样保留（不升级成 `not_executed`）', async () => {
      await claim({ idempotencyKey: 'asked', toolName: 'proxy_send' });
      await lookup('asked', { conclusion: 'unknown', reason: 'non_2xx' });

      const res = await service.list({});

      expect(res.items[0].lastLookup).toMatchObject({
        conclusion: 'unknown',
        reason: 'non_2xx',
        lookedUpBy: 'admin-1',
        asUserId: '7',
        queryMethod: 'GET',
      });
      expect(res.items[0].lastLookup?.at).toBeTruthy();
    });

    it('**反向**：较新的无结论查询不被较早的真答案盖住（最近一次 = 最近问的那次）', async () => {
      await claim({ idempotencyKey: 'flip', toolName: 'proxy_send' });
      // 先问到了「执行过」，后又问了一次但超时 —— 读者看到的是**最近**那次，即 unknown。
      const older = await lookup('flip', { conclusion: 'executed', reason: null });
      const newer = await lookup('flip', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(older.id, { at: new Date('2026-11-01T00:00:00Z') });
      await lookups().update(newer.id, { at: new Date('2026-11-02T00:00:00Z') });

      const res = await service.list({});

      expect(res.items[0].lastLookup).toMatchObject({ conclusion: 'unknown', reason: 'timeout' });
    });

    it('工具没有目标状态查询 ⇒ `reconcilable: false`（「问不了」是一种读数，不是失败）', async () => {
      await claim({ idempotencyKey: 'local', toolName: 'create_todo' });

      const res = await service.list({});

      expect(res.items[0].reconcilable).toBe(false);
      expect(res.items[0].lastLookup).toBeNull();
    });

    it('历史读端点：按 at 降序返回全部查询，带发起人/被执行身份/查询路径', async () => {
      const row = await claim({ idempotencyKey: 'hist', toolName: 'proxy_send' });
      const first = await lookup('hist', { conclusion: 'unknown', reason: 'timeout' });
      const second = await lookup('hist', {
        conclusion: 'executed',
        reason: null,
        queryPath: '/actions/hist?probe=2',
      });
      await lookups().update(first.id, { at: new Date('2026-11-01T00:00:00Z') });
      await lookups().update(second.id, { at: new Date('2026-11-02T00:00:00Z') });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      expect(res?.claimStatus).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(res?.items.map((l) => l.conclusion)).toEqual(['executed', 'unknown']);
      expect(res?.items[0]).toMatchObject({
        lookedUpBy: 'admin-1',
        asUserId: '7',
        queryPath: '/actions/hist?probe=2',
        queryMethod: 'GET',
      });
      expect(res?.total).toBe(2);
    });

    it('**反向**：范围外的 claim ⇒ `null`（调用方 404，不泄露存在性）', async () => {
      const other = await claim({ idempotencyKey: 'other', userId: '9' });
      await lookup('other', { asUserId: '9' });
      await ds.query('INSERT INTO org_members (user_id, org_id) VALUES (7, 5), (8, 5), (9, 6)');
      orgService = { getUserOrgContext: jest.fn().mockResolvedValue({ orgId: 5 }) };
      service = build();

      const res = await service.lookupsFor(other.id, { userId: 7, role: UserRole.AUDITOR });

      expect(res).toBeNull();
      // 管理员仍看得到 —— 范围只收窄审计读者，不是把行藏起来。
      const admin = await service.lookupsFor(other.id, { userId: 7, role: UserRole.ADMIN });
      expect(admin?.total).toBe(1);
    });

    it('不存在的 claim ⇒ `null`（与「范围外」同一个答案：没有这一行）', async () => {
      await expect(
        service.lookupsFor(9999, { userId: 1, role: UserRole.ADMIN }),
      ).resolves.toBeNull();
    });
  });

  /**
   * F-79: the automatic re-ask, read off the rows that already exist. There is no new column and no
   * migration — the count of evidence rows is the count of asks, and the cap it is compared against
   * comes with the page. These cases pin what an operator can see: **how many times we asked** and
   * **whether asking has stopped** — the reading that used to exist only as a log line.
   *
   * F-79：自动重问，读的是**已经存在**的行。不加列、不写迁移 —— 证据行数是询问次数，对比的上限随页带出。
   * 这些用例钉住运维看得见的东西：**问过几次**、**是否已停** —— 此前这只存在于一行日志里的读数。
   */
  describe('F-79：有界自动重问的读数（已问几次 / 已停止）', () => {
    const queued = (key: string, over: Partial<AiWriteClaim> = {}) =>
      claim({
        idempotencyKey: key,
        toolName: 'proxy_send',
        claimedAt: new Date(Date.now() - 3 * 60 * 60_000),
        decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
        ...over,
      });

    it('页上带出上限；没问过的行：`lookupCount: 0`、未停止、给出下一次到期时刻', async () => {
      probe.canAsk.mockReturnValue(true);
      await queued('due');

      const res = await service.list({});

      expect(res.autoReconcileMaxAttempts).toBe(4);
      const row = res.items[0];
      expect(row.lookupCount).toBe(0);
      expect(row.autoReconcileStopped).toBe(false);
      // 3 小时前占位、一次没问过 ⇒ 第一档 +1h 早已到期；这里只断言时刻存在，判据由计划用例钉。
      expect(row.autoReconcileDueAt).toBeTruthy();
    });

    it('问满上限 ⇒ `autoReconcileStopped: true`，且不再给到期时刻', async () => {
      probe.canAsk.mockReturnValue(true);
      await queued('parked');
      for (let i = 1; i <= 4; i++) await lookup('parked');

      const res = await service.list({});

      expect(res.items[0]).toMatchObject({
        lookupCount: 4,
        autoReconcileStopped: true,
        autoReconcileDueAt: null,
      });
    });

    it('仍 `open`（还没进待裁队列）⇒ 不排期：停止为假，但到期时刻为 `null`', async () => {
      probe.canAsk.mockReturnValue(true);
      await queued('inflight', { decisionState: WRITE_CLAIM_DECISION_STATE.OPEN });

      const row = (await service.list({})).items[0];

      expect(row.autoReconcileStopped).toBe(false);
      expect(row.autoReconcileDueAt).toBeNull();
    });

    it('目标问不了 ⇒ 不排期（「问不了」由 `reconcilable` 表达，不在这里重复）', async () => {
      await queued('unaskable', { toolName: 'create_todo' });

      const row = (await service.list({})).items[0];

      expect(row.reconcilable).toBe(false);
      expect(row.autoReconcileDueAt).toBeNull();
      expect(row.autoReconcileStopped).toBe(false);
    });

    it('`lookupCount` 就是查询历史条数（与 `/lookups` 的 `total` 同源，不是另一个计数器）', async () => {
      probe.canAsk.mockReturnValue(true);
      const row = await queued('same-source');
      await lookup('same-source');
      await lookup('same-source');

      const list = await service.list({});
      const history = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      expect(list.items[0].lookupCount).toBe(history?.total);
      expect(list.items[0].lookupCount).toBe(2);
    });
  });
});

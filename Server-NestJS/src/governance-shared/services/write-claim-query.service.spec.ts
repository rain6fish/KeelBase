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

  const build = (
    thresholdMinutes?: number,
    config: Record<string, unknown> = {},
  ): WriteClaimQueryService =>
    new WriteClaimQueryService(
      repo(),
      lookups(),
      { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? thresholdMinutes : config[k]) } as never,
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
        'decisionAgeMinutes',
        'decisionOverdue',
        'decisionPendingSince',
        'decisionState',
        'escalation',
        'id',
        'lastLookup',
        'lookupCount',
        'policyRevision',
        'readingStale',
        'readingStaleSince',
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
        // R-1：没有真答案就没有种类；未记录读作 `unknown`，绝不默认成 `current_state`。
        basis: 'unknown',
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

    /**
     * R-1: two answers that both say `not_executed` are different readings when their bases differ —
     * a receipt says "never accepted", a current-state read only says "not there now". The read face
     * must separate them by `basis` alone, and a row written before the column must read `unknown`
     * rather than being guessed into either kind.
     *
     * R-1：两条都说 `not_executed`，但种类不同就是两条不同的读数 —— 收据说「从未被接受」，当前状态读数
     * 只说「现在没有」。读面必须仅凭 `basis` 区分；早于本列的行必须读作 `unknown`，不得被猜成任一种类。
     */
    it('R-1：同为 not_executed 的两行按 basis 区分；旧行读 unknown（不回填、不猜）', async () => {
      const row = await claim({ idempotencyKey: 'basis', toolName: 'proxy_send' });
      const receipt = await lookup('basis', { conclusion: 'not_executed', reason: null, basis: 'receipt' });
      const snapshot = await lookup('basis', {
        conclusion: 'not_executed',
        reason: null,
        basis: 'current_state',
      });
      const legacy = await lookup('basis', { conclusion: 'not_executed', reason: null });
      expect(legacy.basis ?? null).toBeNull();
      await lookups().update(receipt.id, { at: new Date('2026-11-01T00:00:00Z') });
      await lookups().update(snapshot.id, { at: new Date('2026-11-01T01:00:00Z') });
      await lookups().update(legacy.id, { at: new Date('2026-11-01T02:00:00Z') });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      expect(res?.items.map((l) => l.conclusion)).toEqual([
        'not_executed',
        'not_executed',
        'not_executed',
      ]);
      expect(res?.items.map((l) => l.basis)).toEqual(['unknown', 'current_state', 'receipt']);
      // 反向：把种类映射拿掉（都读成同一种）会让上面这行失去区分力。
      expect(new Set(res?.items.map((l) => l.basis)).size).toBe(3);
    });

    it('F-85：两条读数能读成一对 —— 序位按时间、相邻给间隔、并给出「写 → 首问」', async () => {
      const row = await claim({
        idempotencyKey: 'pair',
        toolName: 'proxy_send',
        claimedAt: new Date('2026-11-01T00:00:00Z'),
      });
      const first = await lookup('pair', { conclusion: 'not_executed', reason: null, lookedUpBy: 'system:sweep' });
      const second = await lookup('pair', { conclusion: 'executed', reason: null });
      await lookups().update(first.id, { at: new Date('2026-11-01T01:00:00Z') });
      await lookups().update(second.id, { at: new Date('2026-11-01T01:10:00Z') });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      // 列表顺序没变（仍是新在前，声明过的那条契约），变的是每行能读出自己在时间上的位置。
      expect(res?.items.map((l) => l.conclusion)).toEqual(['executed', 'not_executed']);
      expect(res?.items[0]).toMatchObject({ seq: 2, intervalSeconds: 600, lookedUpBy: 'admin-1' });
      expect(res?.items[1]).toMatchObject({ seq: 1, intervalSeconds: null, lookedUpBy: 'system:sweep' });
      // 「写 → 首问」一小时：这一段是盲区上界，不是覆盖。
      expect(res?.claimedAt).toBe('2026-11-01T00:00:00.000Z');
      expect(res?.firstLookupAfterWriteSeconds).toBe(3600);
    });

    it('F-85：一次都没问过 ⇒ 首问间隔为 `null`，不造一个 0', async () => {
      const row = await claim({
        idempotencyKey: 'never-asked-2',
        toolName: 'proxy_send',
        claimedAt: new Date('2026-11-01T00:00:00Z'),
      });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      expect(res?.total).toBe(0);
      expect(res?.claimedAt).toBe('2026-11-01T00:00:00.000Z');
      expect(res?.firstLookupAfterWriteSeconds).toBeNull();
    });

    it('R-2：首问距占位一小时 ⇒ 声明读得出「首问之前那一小时未观测」', async () => {
      const row = await claim({
        idempotencyKey: 'coverage-hour',
        toolName: 'proxy_send',
        claimedAt: new Date('2026-11-01T00:00:00Z'),
      });
      const first = await lookup('coverage-hour', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(first.id, { at: new Date('2026-11-01T01:00:00Z') });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      expect(res?.coverage).toEqual({
        basis: 'until-first-lookup',
        unobservedSeconds: 3600,
        observedFrom: '2026-11-01T01:00:00.000Z',
        readingsBeforeClaim: 0,
        expectedFirstAskAfterMinutes: 60,
      });
    });

    it('R-2 **反向**：计划改成十分钟后首问 ⇒ 未观测时长随之缩短，且预期等待读自配置而非字面量', async () => {
      service = build(undefined, { CLAIM_RECONCILE_BACKOFF_MINUTES: '10,60,600,3600' });
      const row = await claim({
        idempotencyKey: 'coverage-ten',
        toolName: 'proxy_send',
        claimedAt: new Date('2026-11-01T00:00:00Z'),
      });
      const first = await lookup('coverage-ten', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(first.id, { at: new Date('2026-11-01T00:10:00Z') });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      expect(res?.coverage.unobservedSeconds).toBe(600);
      expect(res?.coverage.expectedFirstAskAfterMinutes).toBe(10);
    });

    it('R-2：一条读数都没有 ⇒ 占位以来全部未观测，给时长而不是留空', async () => {
      const claimedAt = new Date(Date.now() - 300_000);
      const row = await claim({
        idempotencyKey: 'coverage-none',
        toolName: 'proxy_send',
        claimedAt,
      });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      expect(res?.total).toBe(0);
      expect(res?.coverage.basis).toBe('no-lookups-yet');
      expect(res?.coverage.observedFrom).toBeNull();
      expect(res?.coverage.expectedFirstAskAfterMinutes).toBe(60);
      // 读取时刻参与计算，故只钉一个窄区间：约 300 秒（SQLite 往返之外不留余量给猜测）。
      expect(res?.coverage.unobservedSeconds).toBeGreaterThanOrEqual(300);
      expect(res?.coverage.unobservedSeconds).toBeLessThan(310);
      // 原有字段的口径不变：没问过仍是 `null`，不造一个 0。
      expect(res?.firstLookupAfterWriteSeconds).toBeNull();
    });

    /**
     * R-2 residual / re-claim: a retry of the same key reuses the row and resets `claimedAt`, so the
     * evidence trail can start **before** this attempt. A reading from then says nothing about this
     * attempt; counting it as the first sample made `unobservedSeconds` clamp to 0 and the statement
     * called an unobserved stretch "observed" — the exact false coverage R-2 is meant to remove.
     *
     * R-2 遗留 / 重占位：同一键重试复用同一行并重置 `claimedAt`，故证据链可能早于本次尝试开始。那时
     * 的读数不说明本次的任何情况；把它读作首个采样会让 `unobservedSeconds` 被夹到 0，声明于是把没观测的
     * 一段说成「已观测」—— 正是 R-2 要消掉的那种假覆盖。
     */
    it('R-2 **反向（重占位）**：早于本次占位的旧读数不得把「未观测」说成「已观测」', async () => {
      const row = await claim({
        idempotencyKey: 'reclaim',
        toolName: 'proxy_send',
        claimedAt: new Date('2026-11-01T00:00:00Z'),
      });
      // 上一次尝试留下的读数：一天前问过。重占位把 claimedAt 推到它之后。
      const old = await lookup('reclaim', { conclusion: 'not_executed', reason: null });
      await lookups().update(old.id, { at: new Date('2026-11-01T01:00:00Z') });
      await repo().update(row.id, { claimedAt: new Date('2026-11-02T00:00:00Z') });
      // 本次尝试：半小时后问了一次。
      const fresh = await lookup('reclaim', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(fresh.id, { at: new Date('2026-11-02T00:30:00Z') });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      // 首问 = 本次尝试的第一条（新的一天的 00:30），不是上一次那条。旧实现给的是负值再被夹到 0。
      expect(res?.firstLookupAfterWriteSeconds).toBe(1800);
      expect(res?.coverage).toEqual({
        basis: 'until-first-lookup',
        unobservedSeconds: 1800,
        observedFrom: '2026-11-02T00:30:00.000Z',
        readingsBeforeClaim: 1,
        expectedFirstAskAfterMinutes: 60,
      });
      // 旧读数没有被丢掉：它仍是证据，并由计数说明它早于本次占位。
      expect(res?.items.map((l) => l.conclusion)).toEqual(['unknown', 'not_executed']);
    });

    it('R-2 **反向（重占位）**：读数全部早于本次占位 ⇒ 本次至今未观测，不是 0', async () => {
      const claimedAt = new Date(Date.now() - 300_000);
      const row = await claim({ idempotencyKey: 'reclaim-none', toolName: 'proxy_send', claimedAt });
      const old = await lookup('reclaim-none', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(old.id, { at: new Date(claimedAt.getTime() - 3_600_000) });

      const res = await service.lookupsFor(row.id, { userId: 1, role: UserRole.ADMIN });

      // 「上一次尝试问过」不是「本次问过」：首问仍是 `null`，整段占位都未观测。
      expect(res?.firstLookupAfterWriteSeconds).toBeNull();
      expect(res?.coverage.basis).toBe('no-lookups-yet');
      expect(res?.coverage.observedFrom).toBeNull();
      expect(res?.coverage.readingsBeforeClaim).toBe(1);
      expect(res?.coverage.unobservedSeconds).toBeGreaterThanOrEqual(300);
      expect(res?.coverage.unobservedSeconds).toBeLessThan(310);
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

  /**
   * R-5: the queue used to be driven by claim age only, so "the reading is old, ask again" and "the
   * decision is old, a person must decide" looked the same. These cases pin the split, the stable
   * key, and the rule that neither clock releases anything — an `unknown` reading past its re-ask
   * point still leaves the row `claimed` and in the queue.
   *
   * R-5：队列此前只由占位年龄驱动，于是「读数旧了、该再问」与「决策旧了、该由人裁」长得一样。这些
   * 用例钉住拆分、稳定键，以及「两只钟都不释放」—— 过了重问点的 `unknown` 读数，行仍是 `claimed`、仍在队列。
   */
  describe('R-5：两只时钟（读数新鲜度 vs 决策年龄）', () => {
    const MIN = 60_000;
    const queued = (key: string, claimedAt: Date) =>
      claim({
        idempotencyKey: key,
        toolName: 'proxy_send',
        claimedAt,
        decisionState: WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION,
      });

    it('页上带出决策上限：默认 1440 分钟', async () => {
      const res = await service.list({});
      expect(res.decisionBoundMinutes).toBe(1440);
    });

    it('读数过期、决策未超限 ⇒ 升级为**重问**；行上写明「读数从 X 起陈旧」与「决策从 Y 起待裁」', async () => {
      probe.canAsk.mockReturnValue(true);
      const claimedAt = new Date(Date.now() - 3 * 60 * MIN);
      await queued('reading-stale', claimedAt);

      const row = (await service.list({})).items[0];

      // 决策从窗口关闭那一刻起算 = claimedAt + 60 分钟。
      expect(row.decisionPendingSince).toBe(new Date(claimedAt.getTime() + 60 * MIN).toISOString());
      expect(row.decisionAgeMinutes).toBeGreaterThanOrEqual(119);
      expect(row.decisionAgeMinutes).toBeLessThan(125);
      expect(row.decisionOverdue).toBe(false);
      // 一次没问过 ⇒ 计划的第一档 +1h 早已到期。
      expect(row.readingStale).toBe(true);
      expect(row.readingStaleSince).toBe(new Date(claimedAt.getTime() + 60 * MIN).toISOString());
      expect(row.escalation).toBe('reask');
      // 升级只是「再问一次」的许可：结论与占位形态都没动。
      expect(row.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION);
    });

    it('决策超限 ⇒ 升级为**人**，即便最新读数刚刚问过（读数并未陈旧）', async () => {
      probe.canAsk.mockReturnValue(true);
      const claimedAt = new Date(Date.now() - 30 * 60 * MIN);
      await queued('decision-overdue', claimedAt);
      // 最近一次询问在 5 分钟前 ⇒ 下一档（+6h）远未到期，读数不陈旧。
      const fresh = await lookup('decision-overdue', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(fresh.id, { at: new Date(Date.now() - 5 * MIN) });

      const row = (await service.list({})).items[0];

      expect(row.decisionAgeMinutes).toBeGreaterThanOrEqual(29 * 60);
      expect(row.decisionOverdue).toBe(true);
      expect(row.readingStale).toBe(false);
      expect(row.readingStaleSince).toBeNull();
      expect(row.escalation).toBe('person');
    });

    it('**未知读数过了重问点仍不能释放**：升级只说重问，行仍是 claimed + awaiting', async () => {
      probe.canAsk.mockReturnValue(true);
      const claimedAt = new Date(Date.now() - 9 * 60 * MIN);
      const saved = await queued('unknown-past-due', claimedAt);
      // 一次 `unknown` 读数在 8 小时前 ⇒ 下一档 +6h 已在 2 小时前到期，但决策只悬了 8 小时。
      const answered = await lookup('unknown-past-due', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(answered.id, { at: new Date(claimedAt.getTime() + 60 * MIN) });

      const res = await service.list({});
      const row = res.items.find((r) => r.id === saved.id)!;

      expect(row.readingStale).toBe(true);
      expect(row.decisionOverdue).toBe(false);
      expect(row.escalation).toBe('reask');
      // 未知时钟永不释放：行还在队列里、仍是 claimed，账上没有任何「已释放」的读数。
      expect(res.items.map((r) => r.id)).toContain(saved.id);
      expect(row.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
      expect(row.decisionState).toBe(WRITE_CLAIM_DECISION_STATE.AWAITING_DECISION);
      // 升级取值域里没有 release（类型层也没有）：这里再钉一次运行期的读数。
      expect([null, 'reask', 'person']).toContain(row.escalation);
    });

    it('**稳定键**：重问刷新新鲜度、不重排队列，决策年龄一字不动', async () => {
      probe.canAsk.mockReturnValue(true);
      const older = new Date(Date.now() - 5 * 60 * MIN);
      const newer = new Date(Date.now() - 2 * 60 * MIN);
      const a = await queued('order-a', older);
      await queued('order-b', newer);

      const before = await service.list({});
      expect(before.items.map((r) => r.id)).toEqual([a.id, before.items[1].id]);
      const aBefore = before.items[0];
      expect(aBefore.readingStale).toBe(true);

      // 对最老的行再问一次（读数写入「刚刚」）。
      const reask = await lookup('order-a', { conclusion: 'unknown', reason: 'timeout' });
      await lookups().update(reask.id, { at: new Date() });

      const after = await service.list({});
      // 队首没变：主序是决策年龄，重问没有把它推到队尾。
      expect(after.items.map((r) => r.id)).toEqual(before.items.map((r) => r.id));
      const aAfter = after.items.find((r) => r.id === a.id)!;
      expect(aAfter.readingStale).toBe(false);
      expect(aAfter.decisionPendingSince).toBe(aBefore.decisionPendingSince);
      expect(aAfter.decisionAgeMinutes).toBeGreaterThanOrEqual(aBefore.decisionAgeMinutes!);
    });

    it('决策上限读自配置：调小到 60 分钟后同一条行即超期', async () => {
      service = build(undefined, { CLAIM_DECISION_BOUND_MINUTES: 60 });
      probe.canAsk.mockReturnValue(true);
      await queued('tight-bound', new Date(Date.now() - 3 * 60 * MIN));

      const res = await service.list({});

      expect(res.decisionBoundMinutes).toBe(60);
      expect(res.items[0].decisionOverdue).toBe(true);
      expect(res.items[0].escalation).toBe('person');
    });
  });
});

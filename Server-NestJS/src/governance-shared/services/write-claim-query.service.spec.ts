// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from '../entities/ai-write-claim.entity';
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
      { get: (k: string) => (k === 'REVOKE_STALE_MINUTES' ? thresholdMinutes : undefined) } as never,
      orgService as never,
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiWriteClaim],
      synchronize: true,
    });
    await ds.initialize();
    // 组织范围用的联接形状与审计读侧同源（`org_members`）；本用例表由这里手工建出，
    // 使「组织快照来自账号」这条判定在真实 SQL 上成立，而不是靠替身断言。
    await ds.query('CREATE TABLE org_members (user_id integer NOT NULL, org_id integer NOT NULL)');
    orgService = undefined;
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
        'claimedAt',
        'conversationId',
        'id',
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
});

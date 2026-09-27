// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';

/**
 * REV-11 (the half that needs no contract change): a stuck compensation must say **whose work it is**.
 *
 * `revokeStale` already answers "is anything stuck" and the two windows answer "stuck how". Neither
 * answers the question the roadmap actually raises: "a state nobody is forced to look at slowly
 * becomes the same problem again". Having somewhere to look and having someone who must look are
 * different things.
 *
 * This surface needed no new field and no schema: the accountable party is already a column on the
 * row (the user the write was made on behalf of), and it simply was not being surfaced. The assignee
 * for this surface is the admin role itself — only admins can read the list — so no assignee field is
 * invented here.
 *
 * Old implementation cannot produce the observation: `ownerUserId` is absent from the item, so the
 * assertion below is red against it. Real sqlite, because the staleness filter is a database-side
 * predicate (`revoke_status` + `revoke_requested_at`), not something the mapping layer decides.
 */
const STALE_OWNER = 'u-alice';
const FRESH_OWNER = 'u-bob';
const REVOKED_OWNER = 'u-carol';
/** 接手的管理员（认领记录的是**谁在看**，不是那次写代表谁） */
const CLAIMER = 'u-admin-1';

describe('REV-11 滞留补偿：这是谁的活', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;

  const seed = async (opts: {
    id: number;
    userId: string;
    revokeStatus: string | null;
    requestedMinutesAgo: number | null;
  }): Promise<void> => {
    await ds.getRepository(AiToolSideEffect).save(
      ds.getRepository(AiToolSideEffect).create({
        id: opts.id,
        idempotencyKey: `key-${opts.id}`,
        userId: opts.userId,
        conversationId: 'conv-1',
        toolName: 'proxy_side_create',
        argsHash: 'hash',
        resultType: 'proxy_call',
        resultId: 7,
        revokeClass: 'governed_external',
        revokeStatus: opts.revokeStatus,
        revokeRequestedAt:
          opts.requestedMinutesAgo == null
            ? null
            : new Date(Date.now() - opts.requestedMinutesAgo * 60_000),
      }),
    );
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
    svc = new AiToolEffectsService(ds.getRepository(AiToolSideEffect));
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('滞留行点名责任人；未滞留的不进入该读数', async () => {
    await seed({ id: 1, userId: STALE_OWNER, revokeStatus: 'compensating', requestedMinutesAgo: 240 });
    await seed({ id: 2, userId: FRESH_OWNER, revokeStatus: 'compensating', requestedMinutesAgo: 5 });
    await seed({ id: 3, userId: REVOKED_OWNER, revokeStatus: 'revoked', requestedMinutesAgo: 240 });

    const res = await svc.list({ stale: true });

    expect(res.items).toHaveLength(1);
    const item = res.items[0] as unknown as Record<string, unknown>;
    expect(item.id).toBe(1);
    // 这是本项补上的那一个观测面：**责任人**。旧实现里该字段不存在。
    expect(item.ownerUserId).toBe(STALE_OWNER);
    // 与既有读数一致，不另造一个同义的「需认领」布尔（§15.6/§15.7：同一事实不给两个名字）
    expect(item.revokeStale).toBe(true);
    expect(item.revokeWindow).toBe('unacknowledged');
  });

  it('请求时刻缺失的旧行不进该读数（年龄不可知 ≠ 陈旧）', async () => {
    await seed({ id: 1, userId: STALE_OWNER, revokeStatus: 'compensating', requestedMinutesAgo: null });

    const res = await svc.list({ stale: true });

    // 阈值是库侧谓词（revoke_requested_at < cutoff），NULL 天然不匹配 —— 与 revokeAge「年龄未知故不判陈旧」同口径
    expect(res.items).toHaveLength(0);
  });

  it('需认领是**派生**的：滞留且无人接手；一旦被认领就不再是需认领项', async () => {
    await seed({ id: 1, userId: STALE_OWNER, revokeStatus: 'compensating', requestedMinutesAgo: 240 });

    const before = (await svc.list({ stale: true })).items[0] as unknown as Record<string, unknown>;
    expect(before.revokeNeedsClaim).toBe(true);
    expect(before.revokeClaimedBy).toBeNull();

    const claimed = await svc.claim(1, CLAIMER);
    expect(claimed.outcome).toBe('claimed');

    const after = (await svc.list({ stale: true })).items[0] as unknown as Record<string, unknown>;
    // 仍是滞留行（revokeStale 仍为真），但已不「需认领」—— 两者不是同一件事，故不是重复字段
    expect(after.revokeStale).toBe(true);
    expect(after.revokeNeedsClaim).toBe(false);
    expect(after.revokeClaimedBy).toBe(CLAIMER);
    expect(typeof after.revokeClaimedAt).toBe('string');
  });

  it('认领是条件更新：第二个人认领同一行被拒，且**不覆盖**先到者的记录', async () => {
    await seed({ id: 1, userId: STALE_OWNER, revokeStatus: 'compensating', requestedMinutesAgo: 240 });
    await svc.claim(1, CLAIMER);

    const second = await svc.claim(1, 'u-other-admin');

    expect(second.outcome).toBe('already_claimed');
    // 报出的是**先到者**，不是本次调用者 —— 否则「谁接手了」这句话就被这次拒绝改写了
    expect(second.claimedBy).toBe(CLAIMER);
    const row = await ds.getRepository(AiToolSideEffect).findOneByOrFail({ id: 1 });
    expect(row.revokeClaimedBy).toBe(CLAIMER);
  });

  it('还没到陈旧阈值的行不可认领（那不是「需认领」，是还在等）', async () => {
    await seed({ id: 1, userId: FRESH_OWNER, revokeStatus: 'compensating', requestedMinutesAgo: 5 });

    expect((await svc.claim(1, CLAIMER)).outcome).toBe('not_stale');
  });

  it('非 compensating 的行不可认领（已了结 / 从未请求，都没有「谁在看」可言）', async () => {
    await seed({ id: 1, userId: REVOKED_OWNER, revokeStatus: 'revoked', requestedMinutesAgo: 240 });

    expect((await svc.claim(1, CLAIMER)).outcome).toBe('not_stale');
  });

  it('不存在的行报 not_found，不与「不可认领」混为一谈', async () => {
    expect((await svc.claim(999, CLAIMER)).outcome).toBe('not_found');
  });

  it('认领**不改**补偿读数：状态与年龄照旧（认领只说谁在看，不说外面发生了什么）', async () => {
    await seed({ id: 1, userId: STALE_OWNER, revokeStatus: 'compensating', requestedMinutesAgo: 240 });

    await svc.claim(1, CLAIMER);

    const row = await ds.getRepository(AiToolSideEffect).findOneByOrFail({ id: 1 });
    expect(row.revokeStatus).toBe('compensating');
    expect(row.revokeRequestedAt).not.toBeNull();
  });
});

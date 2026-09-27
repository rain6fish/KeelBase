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
});

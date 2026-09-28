// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';

/**
 * REV-4: a same-key conflict has **two** kinds, and they were treated as one.
 *
 * - A **plain idempotent replay** wrote the same business record twice — nothing to report.
 * - A **different write** happened: this call really did write another business row, and that row has
 *   **no side-effect row carrying it**, so it cannot be revoked. Until now nothing on the path said so:
 *   the caller only saw "idempotent hit".
 *
 * Reachability, measured rather than assumed: the ordinary replay never gets here, because the caller
 * probes for an existing key **before executing the tool** (`findExisting`) and short-circuits — so the
 * tool does not run again and no second row is written. This branch is therefore reached only under
 * **concurrency**: two same-key calls both miss the probe, both execute, one lands and the other hits
 * the unique key. Same shape as ARC-3 — a race past a pre-check.
 *
 * The evidence reuses the existing shape, because on a single row it means the same thing: `declared`
 * is what this call wrote, `stored` is what the ledger holds, so `onlyDeclared` is precisely the write
 * that nothing carries. ARC-6's ruling — only `onlyDeclared` counts — therefore still holds here, with
 * no second criterion.
 *
 * Old implementation cannot produce these observations: the conflict branch returned the existing row
 * without comparing targets, so nothing was marked and the revoke reported success.
 */
const CTX = {
  userId: '42',
  conversationId: 'conv-race',
  toolName: 'create_event',
  args: { title: '同一参数' },
};

describe('REV-4 同键冲突：写了别的记录 vs 纯幂等重放', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;

  /** 目标可撤（本地可撤 + 撤销必成功）——这样「报不报完成」才是可观测的差异 */
  const revoker = {
    canHandle: jest.fn().mockReturnValue(true),
    revoke: jest.fn().mockResolvedValue({ revoked: true }),
    describeTarget: jest.fn().mockResolvedValue(null),
  };

  const effects = () => ds.getRepository(AiToolSideEffect);

  /** 冲突的胜者：按 `record()` 的键公式落一行，指向**另一个**目标（模拟竞态里先落库的那次写） */
  const seedWinner = async (resultType: string, resultId: number): Promise<AiToolSideEffect> => {
    const key = AiToolEffectsService.buildKey(CTX);
    return effects().save(
      effects().create({
        idempotencyKey: key,
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsHash: 'hash',
        resultType,
        resultId,
        revokeClass: 'local_compensate',
        revokeStatus: null,
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
    svc = new AiToolEffectsService(effects(), revoker as never);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('本次写的是**另一条**记录 → 既有行被标争议，且它撤销时**拒绝报完成**（旧实现报成功）', async () => {
    const winner = await seedWinner('event', 7);

    // 落败的那次：同键（同参）但写的是 event#8 —— 工具非确定性下的真实形态
    const returned = await svc.record(CTX, 'event', 8);
    expect(returned.id).toBe(winner.id); // 仍是幂等回放：返回既有行

    const marked = await effects().findOneByOrFail({ id: winner.id });
    expect(marked.revokeDispute).not.toBeNull();
    // 证据里「写了却没有行承载」的那一条 = 本次写的 event#8
    const evidence = JSON.parse(marked.revokeDispute!) as {
      onlyDeclared: Array<{ resultType: string; resultId: number }>;
    };
    expect(evidence.onlyDeclared).toEqual([{ resultType: 'event', resultId: 8 }]);

    // 关键的可观测差异：这条行**撤销不得报完成**（它自己那一条确实撤了，但另一次写没人能撤）
    const res = await svc.revoke(winner.id);
    expect(res?.revoked).toBe(false);
    expect(res?.message ?? '').toContain('声明与持有不一致');
  });

  it('反向对照：本次写的是**同一条**记录 → 纯幂等重放，**不**标记、照常报完成', async () => {
    const winner = await seedWinner('event', 7);

    const returned = await svc.record(CTX, 'event', 7);
    expect(returned.id).toBe(winner.id);

    const untouched = await effects().findOneByOrFail({ id: winner.id });
    expect(untouched.revokeDispute).toBeNull();

    const res = await svc.revoke(winner.id);
    expect(res?.revoked).toBe(true);
    expect(res?.message ?? '').not.toContain('声明与持有不一致');
  });
});

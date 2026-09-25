// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';

/**
 * REV-3「过度分裂」**检出**：同一 `resultType + resultId` 出现在多个补偿组。
 *
 * 组分键吃的是**调用身份**，其中 `conversationId` 会在工具毫不知情的情况下变（会话 id 缺失/查不到时
 * `_resolveConversation` 新建会话；载荷多一个 continuation token 同理）⇒ 同一个 effect 落进两组，
 * **两组各自内部自洽完整**、唯一冲突永不触发、幂等回放根本不执行 —— 记录里没有任何地方读起来异常。
 * 比「少记录」更难发现，故至少要先让它**可见**。
 *
 * 本用例用**真 sqlite**（better-sqlite3 内存库）驱动：检出靠的是库侧 `GROUP BY … HAVING COUNT(DISTINCT …)`，
 * 用 mock 仓库会把「查询写错」一起放过 —— 那恰好是这一条最需要验的东西。
 * 旧实现没有这个能力（无任何跨组重叠检出）→ 对旧实现为红。
 */
describe('REV-3 检出：同一业务对象横跨多个补偿组', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  let seq = 0;

  const seed = async (over: {
    resultType: string;
    resultId: number;
    compensationGroup?: string | null;
  }): Promise<number> => {
    const repo = ds.getRepository(AiToolSideEffect);
    const row = await repo.save(
      repo.create({
        idempotencyKey: `k-${++seq}`,
        userId: '42',
        toolName: 'create_project_with_tasks',
        argsHash: 'h',
        resultType: over.resultType,
        resultId: over.resultId,
        compensationGroup: over.compensationGroup ?? null,
      }),
    );
    return row.id;
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
    svc = new AiToolEffectsService(ds.getRepository(AiToolSideEffect) as never);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('分裂的（同目标两组）被检出，且报出两组与承载它的行', async () => {
    const split1 = await seed({ resultType: 'pm_task', resultId: 88, compensationGroup: 'group-a' });
    const split2 = await seed({ resultType: 'pm_task', resultId: 88, compensationGroup: 'group-b' });
    // 同组两行同目标：不是分裂（组内重复不是问题）
    await seed({ resultType: 'pm_task', resultId: 89, compensationGroup: 'group-a' });
    await seed({ resultType: 'pm_task', resultId: 89, compensationGroup: 'group-a' });
    // 单目标行（无组）：不参与判定
    await seed({ resultType: 'pm_task', resultId: 88, compensationGroup: null });

    const res = await svc.findSplitGroups();

    expect(res.count).toBe(1);
    expect(res.truncated).toBe(false);
    expect(res.splits).toEqual([
      {
        resultType: 'pm_task',
        resultId: 88,
        groups: ['group-a', 'group-b'],
        effectIds: [split1, split2],
      },
    ]);
  });

  it('各组内部自洽完整时也照样检出（分裂之所以难发现，正因为没有任何冲突信号）', async () => {
    // 两个组都由「根 + 子」构成、各自看起来完全正常
    await seed({ resultType: 'pm_project', resultId: 1, compensationGroup: 'group-a' });
    await seed({ resultType: 'crm_task', resultId: 5, compensationGroup: 'group-a' });
    await seed({ resultType: 'pm_project', resultId: 1, compensationGroup: 'group-b' });
    await seed({ resultType: 'crm_task', resultId: 5, compensationGroup: 'group-b' });

    const res = await svc.findSplitGroups();

    expect(res.splits.map((s) => `${s.resultType}:${s.resultId}`)).toEqual([
      'crm_task:5',
      'pm_project:1',
    ]);
  });

  it('干净库 → 检出为空（本判据不制造噪音）', async () => {
    await seed({ resultType: 'pm_task', resultId: 88, compensationGroup: 'group-a' });
    await seed({ resultType: 'pm_task', resultId: 77, compensationGroup: 'group-b' });

    const res = await svc.findSplitGroups();

    expect(res).toEqual({ count: 0, truncated: false, splits: [] });
  });

  it('超过 limit → 如实报告 truncated（检出器不得在自身能力边界上沉默）', async () => {
    for (const id of [1, 2, 3]) {
      await seed({ resultType: 'pm_task', resultId: id, compensationGroup: 'group-a' });
      await seed({ resultType: 'pm_task', resultId: id, compensationGroup: 'group-b' });
    }

    const res = await svc.findSplitGroups(2);

    expect(res.splits).toHaveLength(2);
    expect(res.count).toBe(2);
    expect(res.truncated).toBe(true);
  });
});

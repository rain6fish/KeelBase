// SPDX-License-Identifier: Apache-2.0

import { AiToolEffectsService } from './ai-tool-effects.service';
import type { RevokeDisputeEvidence } from './ai-tool-effects.service';
import type { DeclaredSideEffect } from './effect-composition';

/**
 * REV-1「少记录」：同参数重试在幂等键上冲突 → 整组回滚 → 回放既有组。若工具**非确定性**、重试声明的成员
 * 与首次**不同**，这个差异此前**被静默吞掉**：持有 2 条、声明 3 条时多出的那条永远不被补偿，
 * 而撤销该组的汇总照样全绿 —— 文章所谓最危险的那种「假撤销」。
 *
 * 本组用例钉的是**旧实现不可能产出的观测面**：
 * - 旧实现从不写 `revoke_dispute` → 断言「标记 + 证据落在持有的每一行上」对旧实现为红；
 * - 旧实现的撤销汇总是 `revoked:true` → 断言「disputed 组拒绝报完成」对旧实现为红。
 * 只断言「回放了既有组」（旧行为）是抓不住的 —— 那正是旧实现的样子。
 */

const GROUP = 'base-key-1';
const CTX = {
  userId: '42',
  conversationId: 'conv-9',
  toolName: 'create_project_with_tasks',
  args: { title: 'X' },
};

/** 持有行（已登记的整组）；`extra` 用于叠加争议标记等列 */
function storedRow(
  id: number,
  resultType: string,
  resultId: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    userId: '42',
    toolName: 'create_project_with_tasks',
    resultType,
    resultId,
    revokeClass: 'local_compensate',
    revokeStatus: null,
    compensationGroup: GROUP,
    parentEffectId: id === 1 ? null : 1,
    ...extra,
  };
}

function makeRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((d: unknown) => d),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>, over: { revoked?: boolean } = {}) {
  const revoker = {
    canHandle: jest.fn().mockReturnValue(true),
    revoke: jest.fn().mockResolvedValue({ revoked: over.revoked ?? true }),
    describeTarget: jest.fn().mockResolvedValue({ deletedAt: null }),
  };
  const svc = new AiToolEffectsService(repo as never, revoker as never);
  return { svc, revoker };
}

/** 取某一行上的争议证据（旧实现不会写这个参数 → calls 里根本找不到） */
function disputeOf(repo: ReturnType<typeof makeRepo>, effectId: number): RevokeDisputeEvidence | null {
  const call = repo.update.mock.calls.find(
    (c) => c[0] === effectId && (c[1] as { revokeDispute?: string }).revokeDispute !== undefined,
  );
  const raw = call ? (call[1] as { revokeDispute: string }).revokeDispute : null;
  return raw ? (JSON.parse(raw) as RevokeDisputeEvidence) : null;
}

describe('REV-1 少记录：声明与持有不一致 → 标 disputed 并留存证据', () => {
  const storedTwo = [storedRow(1, 'pm_project', 7), storedRow(2, 'pm_task', 88)];

  /** 造「重试声明与持有不一致」：save 唯一冲突 + listGroup 回放既有组 */
  function colliding(repo: ReturnType<typeof makeRepo>, stored: unknown[]) {
    repo.save.mockRejectedValue(
      new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: ai_tool_side_effects.idempotency_key'),
    );
    repo.find.mockResolvedValue(stored);
  }

  it('重试**多声明** 1 行 → 根行标 disputed，且被拒声明与「多出来的那一条」留成证据', async () => {
    const repo = makeRepo();
    colliding(repo, storedTwo);
    const { svc } = makeService(repo);
    const retried: DeclaredSideEffect[] = [
      { resultType: 'pm_project', resultId: 7 },
      { resultType: 'pm_task', resultId: 88 },
      { resultType: 'pm_task', resultId: 89 }, // 首次调用没声明过 → 此前被静默丢弃
    ];

    const replayed = await svc.recordGroup(CTX, retried);

    // 回放语义不变（幂等重试仍拿回既有整组）
    expect(replayed).toEqual(storedTwo);
    // 但差异不再沉默：证据落在**根行**（组内主体对象）——一处即够，撤销路径按组判定
    const evidence = disputeOf(repo, 1);
    expect(evidence).not.toBeNull();
    expect(evidence!.declared).toEqual(retried);
    expect(evidence!.stored).toEqual([
      { resultType: 'pm_project', resultId: 7 },
      { resultType: 'pm_task', resultId: 88 },
    ]);
    expect(evidence!.onlyDeclared).toEqual([{ resultType: 'pm_task', resultId: 89 }]);
    expect(evidence!.onlyStored).toEqual([]);
    expect(Number.isNaN(Date.parse(evidence!.decidedAt))).toBe(false);
    // 只写一次：同一份证据不逐行复制（O(N²) 文本 + 副本间可能不一致）
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('重试**少声明** → 同样检出（双向求差：持有多出来的那几条照样留证）', async () => {
    const repo = makeRepo();
    colliding(repo, storedTwo);
    const { svc } = makeService(repo);

    await svc.recordGroup(CTX, [{ resultType: 'pm_project', resultId: 7 }]);

    const evidence = disputeOf(repo, 1);
    expect(evidence!.onlyDeclared).toEqual([]);
    expect(evidence!.onlyStored).toEqual([{ resultType: 'pm_task', resultId: 88 }]);
  });

  it('声明与持有**一致** → 不标记（纯幂等重放，既有行为逐字节不变）', async () => {
    const repo = makeRepo();
    colliding(repo, storedTwo);
    const { svc } = makeService(repo);

    const replayed = await svc.recordGroup(CTX, [
      { resultType: 'pm_project', resultId: 7 },
      { resultType: 'pm_task', resultId: 88 },
    ]);

    expect(replayed).toEqual(storedTwo);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('非唯一冲突（DB down）→ 照实上抛，不标记（不把系统故障伪装成声明争议）', async () => {
    const repo = makeRepo();
    repo.save.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const { svc } = makeService(repo);

    await expect(
      svc.recordGroup(CTX, [{ resultType: 'pm_project', resultId: 7 }]),
    ).rejects.toThrow(/connection terminated/);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('REV-1 争议组：撤销不得报告完成', () => {
  const MARK = JSON.stringify({ declared: [], stored: [], onlyDeclared: [], onlyStored: [], decidedAt: 'x' });
  /** 争议标记落在**根行**（id 1）上，子行不带标记——与登记层实际写法一致 */
  const disputed = (id: number, over: Record<string, unknown> = {}) =>
    storedRow(id, id === 1 ? 'pm_project' : 'pm_task', id === 1 ? 7 : 87 + id, {
      ...(id === 1 ? { revokeDispute: MARK } : {}),
      ...over,
    });

  it('多成员组：**撤子行**也拦得住（标记只在根行上，判定按组不按行）', async () => {
    const repo = makeRepo();
    const members = [1, 2, 3].map((i) => disputed(i));
    repo.findOne.mockResolvedValue(members[2]); // 撤一个**子行**（标记在根行 1 上）
    repo.find.mockResolvedValue(members);
    const { svc, revoker } = makeService(repo);

    const res = await svc.revoke(3);

    expect(revoker.revoke).toHaveBeenCalledTimes(3); // 持有的行确实被补偿了（此行不是「失败」）
    expect(res?.cascade).toMatchObject({ total: 3, revoked: 3, failed: 0 });
    // 但「这一次业务动作已完全撤销」为假 —— 声明多出来的成员没有任何行承载
    expect(res?.revoked).toBe(false);
    expect(res?.message).toContain('声明与持有不一致');
    // 两个读数分轴：行级运维态是逐行事实，不因组级争议被改写
    expect(res?.revokeStatus).toBe('revoked');
  });

  it('单成员组（回落单目标路径）→ 同样拒绝报完成', async () => {
    const repo = makeRepo();
    const only = disputed(1);
    repo.findOne.mockResolvedValue(only);
    repo.find.mockResolvedValue([only]); // listGroup 只有一行 → 不走组事务路径
    const { svc } = makeService(repo);

    const res = await svc.revoke(1);

    // 撤销结果可为 null（id 未知）——先钉非空：否则下面的 `?.` 会把 null 读成 undefined，
    // 而 `toBeUndefined()` 恰恰会对它**通过**，那就等于放过了一个真实的空结果。
    expect(res).not.toBeNull();
    expect(res?.cascade).toBeUndefined();
    expect(res?.revoked).toBe(false);
    expect(res?.message).toContain('声明与持有不一致');
  });

  it('已 revoked 的争议行：单条撤销的**幂等跳过**路径也不得报完成', async () => {
    // 跳过路径原本是「幂等成功 → revoked:true」；若只看这一条，争议就又被报告成完成了一次。
    const repo = makeRepo();
    const only = disputed(1, { revokeStatus: 'revoked' });
    repo.findOne.mockResolvedValue(only);
    repo.find.mockResolvedValue([only]);
    const { svc, revoker } = makeService(repo);

    const res = await svc.revoke(1);

    expect(revoker.revoke).not.toHaveBeenCalled();
    expect(res?.skipped).toBe(true);
    expect(res?.reason).toBe('already_revoked');
    expect(res?.revoked).toBe(false);
    expect(res?.message).toContain('声明与持有不一致');
  });

  it('批量撤销：逐条计数仍是逐行事实，而争议组带 disputed 标记（否则 revoked:3 / failed:0 读起来就是全绿）', async () => {
    const repo = makeRepo();
    const members = [1, 2].map((i) => disputed(i, { runId: 'run-1' }));
    repo.find.mockResolvedValue(members);
    const { svc } = makeService(repo);

    const res = await svc.revokeRun('run-1');

    // 持有的行确实被补偿了 → 计数按逐行事实（与组路径、与单成员组路径同一口径）
    expect(res.revoked).toBe(2);
    expect(res.failed).toBe(0);
    expect(res.results.every((r) => r.disputed === true)).toBe(true);
  });

  it('批量里**单成员**争议组与多成员组同一口径：计数不因争议被数成 failed', async () => {
    const repo = makeRepo();
    const only = disputed(1, { runId: 'run-3' }); // 单成员组（组内只有一行）
    repo.find.mockResolvedValue([only]);
    const { svc } = makeService(repo);

    const res = await svc.revokeRun('run-3');

    expect(res.revoked).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.results[0]).toMatchObject({ revoked: true, disputed: true });
  });

  it('无争议的行不出现 disputed 键（不制造无意义的噪音字段）', async () => {
    const repo = makeRepo();
    const clean = storedRow(1, 'pm_project', 7, { runId: 'run-2' });
    repo.find.mockResolvedValue([clean]);
    const { svc } = makeService(repo);

    const res = await svc.revokeRun('run-2');

    expect(res.results[0].disputed).toBeUndefined();
    expect(res.revoked).toBe(1);
  });

  it('争议标记不入副作用哈希链 payload（已知裁决：白名单加 key 会破历史链验签）', () => {
    const repo = makeRepo();
    const { svc } = makeService(repo);

    const payload = (svc as unknown as {
      _chainPayload: (r: Record<string, unknown>) => Record<string, unknown>;
    })._chainPayload({ revokeDispute: '{"x":1}', toolName: 't', userId: '1' });

    expect(payload).not.toHaveProperty('revokeDispute');
    expect(payload).toHaveProperty('toolName', 't');
  });
});

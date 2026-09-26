// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'crypto';
import { AiToolEffectsService } from './ai-tool-effects.service';

/**
 * REV-5「过度分裂」：**撤销时的闸门**，而不是库侧扫描。
 *
 * 同一个 `resultType + resultId` 落进两组（组分键吃的 `conversationId` 会在工具毫不知情时变）⇒ 撤销其中
 * 一组时，活下来的那一组**仍指着刚被撤销的 effect**，而它的业务动作并不随本次撤销结束。写时每组各自内部
 * 都是正确的 —— 那里**没有主语**；这个失败只在撤销进行时才可察。
 *
 * 本组用例钉的是**旧实现不可能产出的观测面**：旧实现的撤销结论一律 `revoked:true`（`_compensateGroup` /
 * `_doRevokeSingle` 都是「逐行都补偿成功即完成」），从不问「别的组是否也主张它」→ 下列断言对旧实现为红。
 * 只断言「`findSplitGroups()` 能查出重叠」（第 1 轮已覆盖）抓不住这里 —— 那正是「可见而不受约束」的样子。
 *
 * 四个边界一并钉住：只拦「活着的」另一组、组键逐字节不动、行级计数不被降级改写、无组的历史行行为不变。
 */
const G = 'grp-a';
const OTHER = 'grp-b';

/** 一行副作用；`group` 缺省即本次撤销的组；`revokeStatus='revoked'` 表示该组已补偿完（不再主张） */
function fx(
  id: number,
  resultType: string,
  resultId: number,
  group: string | null = G,
  revokeStatus: string | null = null,
  runId: string | null = 'run-1',
) {
  return {
    id,
    userId: '42',
    conversationId: 'conv-9',
    toolName: 'create_project_with_tasks',
    resultType,
    resultId,
    revokeClass: 'local_compensate',
    revokeStatus,
    compensationGroup: group,
    parentEffectId: id === 1 ? null : 1,
    runId,
  };
}

type Row = ReturnType<typeof fx>;

function makeRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  const revoker = {
    canHandle: jest.fn().mockReturnValue(true),
    revoke: jest.fn().mockResolvedValue({ revoked: true }),
    // ARC-1：本地软删语义下，`revoked` 的行**目标是软的**——夹具此前一律给 `deletedAt: null`（永远「活着」），
    // 那是把「已撤销」当跳过态用的**代称**，没有建模这对真实配对。幂等判据现在读目标，故这里如实给软删。
    describeTarget: jest.fn().mockResolvedValue({ deletedAt: new Date('2026-01-01T00:00:00Z') }),
  };
  const svc = new AiToolEffectsService(repo as never, revoker as never);
  return { svc, revoker };
}

/**
 * 仓库 mock：`find` 按传入的 `where` 形状过滤**全表**（同真实库），使服务里的跨组判定（数组 where）、
 * 载组（`{compensationGroup}`）与按 run/会话圈定（`{runId}`）都走同一条真实路径 ——
 * 它顺带验了两件事：同组的行**不算**别人的主张；跨组主张是**撤销时按组**问出来的。
 */
function repoWith(all: Row[]) {
  const repo = makeRepo();
  repo.find.mockImplementation(async (opts?: { where?: unknown }) => {
    const w = opts?.where;
    if (Array.isArray(w)) {
      const targets = new Set(
        (w as Array<{ resultType: string; resultId: number }>).map(
          (t) => `${t.resultType}:${t.resultId}`,
        ),
      );
      return all.filter((r) => targets.has(`${r.resultType}:${r.resultId}`));
    }
    if (w && typeof w === 'object') {
      return all.filter((r) =>
        Object.entries(w as Record<string, unknown>).every(
          ([k, v]) => (r as Record<string, unknown>)[k] === v,
        ),
      );
    }
    return all;
  });
  return repo;
}

describe('REV-5 撤销闸门：另一活组主张同一 effect → 本次撤销不得报完成', () => {
  it('多成员组：别组仍主张本组一个 effect → 组级结论不得报完成，且说得出是哪个组', async () => {
    const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88)];
    const other = fx(9, 'pm_task', 88, OTHER, null, 'run-2'); // 另一个**活着的**组也主张 pm_task#88
    const repo = repoWith([...members, other]);
    repo.findOne.mockResolvedValue(members[1]); // 撤组内第 2 条
    const { svc, revoker } = makeService(repo);

    const res = (await svc.revoke(2))!;

    // 行级事实不变：持有的两条确实都被补偿了（逐条计数不被降级改写）
    expect(revoker.revoke).toHaveBeenCalledTimes(2);
    expect(res.cascade).toEqual({ groupId: G, total: 2, revoked: 2, skipped: 0, failed: 0 });
    expect(res.revokeStatus).toBe('revoked');
    // 但「这次业务动作已完全撤销」为假：那一组的业务动作不在本次范围内
    expect(res.revoked).toBe(false);
    expect(res.message).toContain('仍主张');
    expect(res.message).toContain(OTHER);
    expect(res.message).toContain('pm_task#88');
  });

  it('单成员组（走单目标路径）→ 同样拦得住（分裂最朴素的样子：两次调用各成一组）', async () => {
    const only = fx(1, 'pm_project', 7);
    const other = fx(9, 'pm_project', 7, OTHER, null, 'run-2');
    const repo = repoWith([only, other]);
    repo.findOne.mockResolvedValue(only);
    const { svc } = makeService(repo);

    const res = (await svc.revoke(1))!;

    expect(res.cascade).toBeUndefined();
    expect(res.revoked).toBe(false);
    expect(res.message).toContain('仍主张');
  });

  it('另一组**已补偿完**（revoke_status=revoked）→ 不再主张 → 照常报完成（不制造误拦）', async () => {
    const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88)];
    const dead = fx(9, 'pm_task', 88, OTHER, 'revoked', 'run-2');
    const repo = repoWith([...members, dead]);
    repo.findOne.mockResolvedValue(members[0]);
    const { svc } = makeService(repo);

    const res = (await svc.revoke(1))!;

    expect(res.revoked).toBe(true);
    expect(res.message).not.toContain('仍主张');
  });

  it('只有**本组**的行碰同一对象（同组重复不是重叠）→ 不拦', async () => {
    const members = [fx(1, 'pm_project', 7), fx(2, 'pm_project', 7, G)];
    const repo = repoWith(members);
    repo.findOne.mockResolvedValue(members[0]);
    const { svc } = makeService(repo);

    const res = (await svc.revoke(1))!;

    expect(res.revoked).toBe(true);
  });

  it('单目标行（无组）→ 不参与跨组判定，行为不变', async () => {
    const legacy = fx(1, 'pm_project', 7, null);
    const other = fx(9, 'pm_project', 7, OTHER, null, 'run-2');
    const repo = repoWith([legacy, other]);
    repo.findOne.mockResolvedValue(legacy);
    const { svc } = makeService(repo);

    const res = (await svc.revoke(1))!;

    // 无组 = 不属于任何业务动作的补偿组，本次撤销不涉及「另一组的动作是否结束」
    expect(res.revoked).toBe(true);
    expect(res.compensationGroup).toBeUndefined();
  });

  it('幂等跳过路径：本组已撤销但别组仍主张 → 不得以「幂等成功」的口径报完成', async () => {
    const only = fx(1, 'pm_project', 7, G, 'revoked');
    const other = fx(9, 'pm_project', 7, OTHER, null, 'run-2');
    const repo = repoWith([only, other]);
    repo.findOne.mockResolvedValue(only);
    const { svc, revoker } = makeService(repo);

    const res = (await svc.revoke(1))!;

    expect(revoker.revoke).not.toHaveBeenCalled();
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('already_revoked');
    expect(res.revoked).toBe(false);
    expect(res.message).toContain('仍主张');
  });

  it('批量撤销：逐条计数是逐行事实，命中跨组主张的组带 disputed 标记', async () => {
    const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88)];
    const other = fx(9, 'pm_task', 88, OTHER, null, 'run-2'); // 不在本次 run 内
    const repo = repoWith([...members, other]);
    const { svc } = makeService(repo);

    const res = (await svc.revokeRun('run-1'))!;

    expect(res.revoked).toBe(2); // 逐行事实：本次圈定的两条确实被补偿了
    expect(res.failed).toBe(0);
    expect(res.results.every((r) => r.disputed === true)).toBe(true);
  });

  it('组键逐字节不动：buildKey / memberKey 仍按**文档公式**算（换键会把可恢复失败换成不可恢复的）', () => {
    const ctx = {
      userId: '42',
      conversationId: 'conv-9',
      toolName: 'create_project_with_tasks',
      args: { title: 'X', startTime: '2026-08-01' },
    };
    const stable = JSON.stringify({ startTime: '2026-08-01', title: 'X' }); // 递归按 key 排序后的 args
    const sha = (s: string) => createHash('sha256').update(s).digest('hex');

    // 这两把键答的是「是不是同一个请求」（幂等与去重都建在它们上面），不是「撤销会碰到什么」
    expect(AiToolEffectsService.buildKey(ctx)).toBe(
      sha(`42:conv-9:create_project_with_tasks:${stable}`),
    );
    expect(AiToolEffectsService.memberKey('base', 1, 'pm_task', 88)).toBe(
      sha('base:1:pm_task:88'),
    );
  });
});

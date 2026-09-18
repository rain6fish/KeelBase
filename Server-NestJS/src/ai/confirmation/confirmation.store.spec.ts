// SPDX-License-Identifier: Apache-2.0

import {
  ConfirmationStore,
  CONFIRMATION_STATUS,
  CONFIRMATION_OUTCOME,
  CONFIRMATION_DEFAULT_TTL_MS,
  CONFIRMATION_DEFAULT_OFFLINE_TTL_MS,
} from './confirmation.store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ConfirmationStore', () => {
  let repo: { save: jest.Mock; create: jest.Mock; update: jest.Mock; findOne: jest.Mock };
  let store: ConfirmationStore;

  beforeEach(() => {
    repo = {
      save: jest.fn().mockResolvedValue({ id: 1 }),
      create: jest.fn((input: unknown) => input),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
    };
    store = new ConfirmationStore(repo as any, 1000);
  });

  it('§确认生命周期 绑定：状态集 / 决策集 / 双窗口默认 TTL == 冻结语料（v2）', () => {
    const vec = JSON.parse(
      readFileSync(resolve(__dirname, '../../../specs/protocol/confirmation-lifecycle-v2-vector.json'), 'utf8'),
    ) as { states: string[]; outcomes: string[]; defaultTtlSeconds: number; defaultOfflineTtlSeconds: number };
    expect(Object.values(CONFIRMATION_STATUS).sort()).toEqual([...vec.states].sort());
    expect(Object.values(CONFIRMATION_OUTCOME).sort()).toEqual([...vec.outcomes].sort());
    expect(CONFIRMATION_DEFAULT_TTL_MS).toBe(vec.defaultTtlSeconds * 1000);
    // v2 的第二个窗口：对话内等待（上）结束后，行继续保持 pending 到离线窗口到期
    expect(CONFIRMATION_DEFAULT_OFFLINE_TTL_MS).toBe(vec.defaultOfflineTtlSeconds * 1000);
  });

  it('should resolve approve for the owning user', async () => {
    const { token, decision } = await store.create('1', 'create_event', { title: 'T' });

    expect(await store.resolve(token, '1', 'approve')).toBe(true);
    await expect(decision).resolves.toMatchObject({ outcome: 'approve' });
    expect(store.pendingCount).toBe(0);
    // 落库：create 写 pending，resolve 更新 approved
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ riskLevel: 'R3', status: 'pending', operatorId: '1' }),
    );
    expect(repo.update).toHaveBeenCalledWith(
      { token, operatorId: '1', status: 'pending' },
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('should resolve decline for the owning user', async () => {
    const { token, decision } = await store.create('1', 'create_event', { title: 'T' });

    expect(await store.resolve(token, '1', 'decline')).toBe(true);
    await expect(decision).resolves.toMatchObject({ outcome: 'decline' });
  });

  it('legacy reject 归一为 decline（CE-1 B3b 决策词统一兼容别名）', async () => {
    const { token, decision } = await store.create('1', 'create_event', { title: 'T' });

    expect(await store.resolve(token, '1', 'reject')).toBe(true);
    await expect(decision).resolves.toMatchObject({ outcome: 'decline' });
    expect(repo.update).toHaveBeenCalledWith(
      { token, operatorId: '1', status: 'pending' },
      expect.objectContaining({ status: 'declined' }),
    );
  });

  it('落库携带 conversationId（docs/run-level-approval.spec.md §2.4：重启后按会话可查可裁决）', async () => {
    await store.create('1', 'create_event', { title: 'T' }, undefined, 'conv-single');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'single', conversationId: 'conv-single' }),
    );

    repo.create.mockClear();
    await store.createRun(
      '1',
      [{ toolName: 'create_event', args: {}, summary: 's', riskLevel: 'R3' }],
      'R3',
      undefined,
      'conv-run',
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'run', conversationId: 'conv-run' }),
    );
  });

  it('should reject a different user (cross-user attempt)', async () => {
    const { token, decision } = await store.create('1', 'create_event', { title: 'T' });

    expect(await store.resolve(token, '2', 'approve')).toBe(false);
    // 原 pending 未被消费，仍可被本人确认
    expect(await store.resolve(token, '1', 'approve')).toBe(true);
    await expect(decision).resolves.toMatchObject({ outcome: 'approve' });
  });

  it('should reject an unknown token', async () => {
    expect(await store.resolve('nope', '1', 'approve')).toBe(false);
  });

  it('等待窗口到期：只结束对话内等待，**不**改 DB（v2 两个窗口——行仍 pending 等离线窗口）', async () => {
    store = new ConfirmationStore(repo as any, 20);
    const { token, decision } = await store.create('1', 'create_event', { title: 'T' });
    expect(store.pendingCount).toBe(1);

    await expect(decision).resolves.toMatchObject({ outcome: 'timeout' });
    expect(store.pendingCount).toBe(0);
    // 内存等待已结束 → 对话内不能再裁决
    expect(await store.resolve(token, '1', 'approve')).toBe(false);
    // 但**不动 DB**：行保持 pending，供离线窗口内经 Action Center 裁决（v2 的核心变更；
    // 转 timeout 的职责移交给 expireStale 定时任务）
    expect(repo.update).not.toHaveBeenCalled();
  });

  describe('GA 离线裁决（confirmation-lifecycle v2：via out_of_band）', () => {
    it('本人离线 approve：条件更新命中 → ok；**不**替对话内等待 resolve（防二次执行）', async () => {
      const { token, decision } = await store.create('1', 'create_event', { title: 'T' });
      repo.findOne.mockResolvedValue({ token, operatorId: '1', status: 'pending' });

      const res = await store.decideOutOfBand(token, '1', 'approve');

      expect(res).toMatchObject({ ok: true, status: 'approved' });
      expect(repo.update).toHaveBeenCalledWith(
        { token, operatorId: '1', status: 'pending' },
        expect.objectContaining({ status: 'approved' }),
      );
      // 对话内的等待仍挂着（不被替它 resolve）——否则对话流会再执行一次
      expect(store.pendingCount).toBe(1);
      // 对话里此时再点：条件更新未命中 → false，不二次执行
      repo.update.mockResolvedValueOnce({ affected: 0 });
      expect(await store.resolve(token, '1', 'approve')).toBe(false);
      void decision; // 该等待由「对话内等待窗口」定时器负责收尾（store 构造时给了 1000ms）
    });

    it('幂等：行已非 pending（重复点击 / 与对话内裁决并发）→ already_decided，绝不再次执行', async () => {
      repo.findOne.mockResolvedValue({ token: 'x'.repeat(8), operatorId: '1', status: 'approved' });
      repo.update.mockResolvedValue({ affected: 0 });

      const res = await store.decideOutOfBand('x'.repeat(8), '1', 'approve');

      expect(res).toMatchObject({ ok: false, reason: 'already_decided', status: 'approved' });
    });

    it('越权：他人 token → not_found（与不存在同形，不泄露存在性）且不改状态', async () => {
      repo.findOne.mockResolvedValue({ token: 'y'.repeat(8), operatorId: '2', status: 'pending' });

      const res = await store.decideOutOfBand('y'.repeat(8), '1', 'approve');

      expect(res).toMatchObject({ ok: false, reason: 'not_found' });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('legacy reject 归一为 decline：离线拒绝同样落 declined', async () => {
      const { token } = await store.create('1', 'create_event', { title: 'T' });
      repo.findOne.mockResolvedValue({ token, operatorId: '1', status: 'pending' });

      const res = await store.decideOutOfBand(token, '1', 'reject');

      expect(res).toMatchObject({ ok: true, status: 'declined' });
    });

    it('对话内等待已过期（内存无该 token）时仍可离线裁决——那正是「离线」的意义', async () => {
      repo.findOne.mockResolvedValue({ token: 'z'.repeat(8), operatorId: '1', status: 'pending' });

      const res = await store.decideOutOfBand('z'.repeat(8), '1', 'approve');

      expect(res).toMatchObject({ ok: true, status: 'approved' });
    });
  });

  it('expireStale：把超离线窗口的 pending 行转 timeout，返回受影响行数', async () => {
    repo.update.mockResolvedValue({ affected: 3 });

    const n = await store.expireStale(60_000);

    expect(n).toBe(3);
    const [criteria, patch] = repo.update.mock.calls[0];
    expect(criteria).toMatchObject({ status: 'pending' });
    expect(patch).toMatchObject({ status: 'timeout' });
  });

  // KB-5 run-level approval（docs/run-level-approval.spec.md §2.4）
  it('createRun：落库 kind=run + run_items 快照 + runRisk，一次授权放行整批', async () => {
    const items = [
      { toolName: 'create_event', args: { title: 'A' }, summary: '创建事件：A', riskLevel: 'R3' },
      { toolName: 'create_todo', args: { title: 'B' }, summary: '创建待办：B', riskLevel: 'R3' },
    ];
    const { token, decision } = await store.createRun('1', items, 'R3');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        token,
        toolName: 'run',
        kind: 'run',
        riskLevel: 'R3',
        runItems: JSON.stringify(items),
        status: 'pending',
        operatorId: '1',
      }),
    );
    // 一次 resolve（run token）→ decision 放行整批
    expect(await store.resolve(token, '1', 'approve')).toBe(true);
    await expect(decision).resolves.toMatchObject({ outcome: 'approve' });
    expect(store.pendingCount).toBe(0);
  });

  it('createRun：拒绝整批（decline）', async () => {
    const items = [
      { toolName: 'create_event', args: { title: 'A' }, summary: '创建事件：A', riskLevel: 'R3' },
      { toolName: 'create_todo', args: { title: 'B' }, summary: '创建待办：B', riskLevel: 'R3' },
    ];
    const { token, decision } = await store.createRun('1', items, 'R3');
    expect(await store.resolve(token, '1', 'reject')).toBe(true);
    await expect(decision).resolves.toMatchObject({ outcome: 'decline' });
  });
});

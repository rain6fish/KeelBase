// SPDX-License-Identifier: Apache-2.0

import { ConfirmationStore } from './confirmation.store';

describe('ConfirmationStore', () => {
  let repo: { save: jest.Mock; create: jest.Mock; update: jest.Mock };
  let store: ConfirmationStore;

  beforeEach(() => {
    repo = {
      save: jest.fn().mockResolvedValue({ id: 1 }),
      create: jest.fn((input: unknown) => input),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    store = new ConfirmationStore(repo as any, 1000);
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
      { token, status: 'pending' },
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('should resolve decline for the owning user', async () => {
    const { token, decision } = await store.create('1', 'create_event', { title: 'T' });

    expect(await store.resolve(token, '1', 'reject')).toBe(true);
    await expect(decision).resolves.toMatchObject({ outcome: 'decline' });
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

  it('should auto-resolve timeout after ttl', async () => {
    store = new ConfirmationStore(repo as any, 20);
    const { token, decision } = await store.create('1', 'create_event', { title: 'T' });
    expect(store.pendingCount).toBe(1);

    await expect(decision).resolves.toMatchObject({ outcome: 'timeout' });
    expect(store.pendingCount).toBe(0);
    // 超时后 token 已失效
    expect(await store.resolve(token, '1', 'approve')).toBe(false);
    // 超时落库 status=timeout
    expect(repo.update).toHaveBeenCalledWith(
      { token, status: 'pending' },
      expect.objectContaining({ status: 'timeout' }),
    );
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

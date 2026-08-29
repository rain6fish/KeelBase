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
});

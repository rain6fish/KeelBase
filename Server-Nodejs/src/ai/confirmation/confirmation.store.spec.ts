import { ConfirmationStore } from './confirmation.store';

describe('ConfirmationStore', () => {
  it('should resolve approve for the owning user', async () => {
    const store = new ConfirmationStore(1000);
    const { token, decision } = store.create('1', 'create_event', { title: 'T' });

    expect(store.resolve(token, '1', 'approve')).toBe(true);
    await expect(decision).resolves.toBe('approve');
    expect(store.pendingCount).toBe(0);
  });

  it('should resolve decline for the owning user', async () => {
    const store = new ConfirmationStore(1000);
    const { token, decision } = store.create('1', 'create_event', { title: 'T' });

    expect(store.resolve(token, '1', 'reject')).toBe(true);
    await expect(decision).resolves.toBe('decline');
  });

  it('should reject a different user (cross-user attempt)', async () => {
    const store = new ConfirmationStore(1000);
    const { token, decision } = store.create('1', 'create_event', { title: 'T' });

    expect(store.resolve(token, '2', 'approve')).toBe(false);
    // 原 pending 未被消费，仍可被本人确认
    expect(store.resolve(token, '1', 'approve')).toBe(true);
    await expect(decision).resolves.toBe('approve');
  });

  it('should reject an unknown token', () => {
    const store = new ConfirmationStore(1000);
    expect(store.resolve('nope', '1', 'approve')).toBe(false);
  });

  it('should auto-resolve timeout after ttl', async () => {
    const store = new ConfirmationStore(20);
    const { token, decision } = store.create('1', 'create_event', { title: 'T' });
    expect(store.pendingCount).toBe(1);

    await expect(decision).resolves.toBe('timeout');
    expect(store.pendingCount).toBe(0);
    // 超时后 token 已失效
    expect(store.resolve(token, '1', 'approve')).toBe(false);
  });
});

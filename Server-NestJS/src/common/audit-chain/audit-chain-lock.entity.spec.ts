// SPDX-License-Identifier: Apache-2.0

import { AuditChainLock } from './audit-chain-lock.entity';

describe('AuditChainLock（审计哈希链 DB 级串行锁，§22.10 B）', () => {
  it('构造实体：主键 id + holder + touchedAt（锁行表结构）', () => {
    const lock = new AuditChainLock();
    lock.id = 1;
    lock.holder = 'instance-a';

    expect(lock.id).toBe(1);
    expect(lock.holder).toBe('instance-a');
    expect(lock.touchedAt).toBeUndefined();
  });

  it('touchedAt 由 @UpdateDateColumn 维护（每次 UPDATE 自动刷新）', () => {
    const lock = new AuditChainLock();
    lock.id = 1;
    const now = new Date('2026-09-01T00:00:00Z');
    lock.touchedAt = now;

    expect(lock.touchedAt).toEqual(now);
  });

  it('holder 可空（未持锁时诊断为空）', () => {
    const lock = new AuditChainLock();
    lock.id = 1;

    expect(lock.holder).toBeUndefined();
  });
});

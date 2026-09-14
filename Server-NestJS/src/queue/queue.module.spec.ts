// SPDX-License-Identifier: Apache-2.0

import { QueueModule } from './queue.module';

/**
 * QueueModule.register() 的核心逻辑是「QUEUE_ENABLED=false 时降级为空模块」——
 * 保证测试环境（createTestApp 置 false）完全不建立 Redis 连接，避免 BullMQ 连不上阻塞。
 * 该分支若回退，e2e 会在无 Redis 时挂起（CI 曾发生），故这里锁住行为。
 */
describe('QueueModule.register（QUEUE_ENABLED 降级）', () => {
  const orig = process.env.QUEUE_ENABLED;
  afterEach(() => {
    if (orig === undefined) delete process.env.QUEUE_ENABLED;
    else process.env.QUEUE_ENABLED = orig;
  });

  it('QUEUE_ENABLED=false → 空模块（不建 Redis 连接）', () => {
    process.env.QUEUE_ENABLED = 'false';
    const mod = QueueModule.register();
    expect(mod.module).toBe(QueueModule);
    expect(mod.imports).toEqual([]);
    expect(mod.exports).toEqual([]);
  });

  it('未配置 → 默认启用，挂 BullMQ 队列', () => {
    delete process.env.QUEUE_ENABLED;
    const mod = QueueModule.register();
    expect(mod.module).toBe(QueueModule);
    expect((mod.imports ?? []).length).toBeGreaterThan(0);
  });

  it('QUEUE_ENABLED=true → 挂 BullMQ 队列', () => {
    process.env.QUEUE_ENABLED = 'true';
    const mod = QueueModule.register();
    expect((mod.imports ?? []).length).toBeGreaterThan(0);
  });
});

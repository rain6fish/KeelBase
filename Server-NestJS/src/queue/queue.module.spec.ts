// SPDX-License-Identifier: Apache-2.0

import { QueueModule } from './queue.module';

/**
 * QueueModule.register() 的核心逻辑是「开关关闭（含未配置）时降级为空模块」——
 * 保证测试环境（createTestApp 置 false）与零配置启动都不建立 Redis 连接，避免 BullMQ
 * 连不上时阻塞启动、持续重连刷 ECONNREFUSED（曾默认开启，2026-09-22 实测 ~4 条/秒）。
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

  it('未配置 → 默认关闭（队列必须依赖 Redis，零配置不去连）', () => {
    delete process.env.QUEUE_ENABLED;
    const mod = QueueModule.register();
    expect(mod.module).toBe(QueueModule);
    expect(mod.imports).toEqual([]);
  });

  it('QUEUE_ENABLED=true → 挂 BullMQ 队列', () => {
    process.env.QUEUE_ENABLED = 'true';
    const mod = QueueModule.register();
    expect((mod.imports ?? []).length).toBeGreaterThan(0);
  });
});

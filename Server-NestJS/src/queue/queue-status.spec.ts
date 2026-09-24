// SPDX-License-Identifier: Apache-2.0

import { queueStatus } from './queue-status';

describe('queueStatus（REL-1：队列维必须如实）', () => {
  const original = process.env.QUEUE_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.QUEUE_ENABLED;
    else process.env.QUEUE_ENABLED = original;
  });

  it('未启用（默认）→ disabled：配置选择，不是故障', () => {
    delete process.env.QUEUE_ENABLED;
    expect(queueStatus(true, 'up')).toBe('disabled');
  });

  it('已启用且 Redis 可达 → up', () => {
    process.env.QUEUE_ENABLED = 'true';
    expect(queueStatus(true, 'up')).toBe('up');
  });

  it('已启用但 Redis 不可达 → down —— 注入了 Queue 也不得算 up', () => {
    process.env.QUEUE_ENABLED = 'true';
    expect(queueStatus(true, 'down')).toBe('down');
  });

  it('已启用却没拿到 Queue → down', () => {
    process.env.QUEUE_ENABLED = 'true';
    expect(queueStatus(false, 'up')).toBe('down');
  });
});

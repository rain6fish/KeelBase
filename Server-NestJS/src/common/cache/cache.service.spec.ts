// SPDX-License-Identifier: Apache-2.0

import { CacheService } from './cache.service';

describe('CacheService', () => {
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  function createService(enabled = true) {
    return new CacheService(mockCache as any, enabled);
  }

  beforeEach(() => jest.clearAllMocks());

  it('get returns cached value when enabled', async () => {
    mockCache.get.mockResolvedValue({ id: 1 });
    const service = createService();

    const result = await service.get('user:1');

    expect(result).toEqual({ id: 1 });
    expect(mockCache.get).toHaveBeenCalledWith('user:1');
  });

  it('get returns undefined when disabled', async () => {
    const service = createService(false);

    const result = await service.get('user:1');

    expect(result).toBeUndefined();
    expect(mockCache.get).not.toHaveBeenCalled();
  });

  it('set skips null values (cache penetration protection)', async () => {
    const service = createService();

    await service.set('k', null, 100);

    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('set stores value when enabled', async () => {
    const service = createService();

    await service.set('user:1', { id: 1 }, 300000);

    expect(mockCache.set).toHaveBeenCalledWith('user:1', { id: 1 }, 300000);
  });

  it('delete removes key', async () => {
    const service = createService();

    await service.delete('user:1');

    expect(mockCache.del).toHaveBeenCalledWith('user:1');
  });

  it('swallows store errors (degraded, non-blocking)', async () => {
    mockCache.get.mockRejectedValue(new Error('redis down'));
    const service = createService();

    await expect(service.get('user:1')).resolves.toBeUndefined();
    await expect(service.set('user:1', { x: 1 })).resolves.toBeUndefined();
  });

  it('delByPrefix：经 stores[0].store.client（KeyvRedis → node-redis）scanIterator + 数组 del', async () => {
    const client = {
      scanIterator: jest.fn(() => (async function* () {
        yield 'events:list:1:20';
        yield 'events:search:1';
      })()),
      del: jest.fn().mockResolvedValue(2),
    };
    mockCache.stores = [{ store: { client } }];
    const service = createService();

    await service.delByPrefix('events:');

    expect(client.scanIterator).toHaveBeenCalledWith({ MATCH: 'events:*' });
    // node-redis 的 del 必须传**数组**（spread 只删第一个 key）
    expect(client.del).toHaveBeenCalledWith(['events:list:1:20', 'events:search:1']);
  });

  it('delByPrefix no-ops when disabled', async () => {
    const service = createService(false);

    await service.delByPrefix('events:');

    expect(mockCache.del).not.toHaveBeenCalled();
  });

  it('set store error swallowed (degraded, non-blocking)', async () => {
    mockCache.set.mockRejectedValue(new Error('redis down'));
    const service = createService();

    await expect(service.set('user:1', { x: 1 })).resolves.toBeUndefined();
  });

  it('delete store error swallowed (degraded, non-blocking)', async () => {
    mockCache.del.mockRejectedValue(new Error('redis down'));
    const service = createService();

    await expect(service.delete('user:1')).resolves.toBeUndefined();
  });

  it('delByPrefix store error swallowed (degraded, non-blocking)', async () => {
    mockCache.stores = [{ client: { keys: jest.fn().mockRejectedValue(new Error('redis down')) } }];
    const service = createService();

    await expect(service.delByPrefix('events:')).resolves.toBeUndefined();
  });
});

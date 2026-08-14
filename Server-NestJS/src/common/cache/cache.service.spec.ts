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

  it('delByPrefix deletes keys via ioredis client', async () => {
    mockCache.stores = [
      { client: { keys: jest.fn().mockResolvedValue(['events:list:1:20', 'events:search:1']), del: jest.fn() } },
    ];
    const service = createService();

    await service.delByPrefix('events:');

    const client = mockCache.stores[0].client;
    expect(client.keys).toHaveBeenCalledWith('events:*');
    expect(client.del).toHaveBeenCalledWith('events:list:1:20', 'events:search:1');
  });

  it('delByPrefix no-ops when disabled', async () => {
    const service = createService(false);

    await service.delByPrefix('events:');

    expect(mockCache.del).not.toHaveBeenCalled();
  });
});

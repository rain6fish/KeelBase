import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * 缓存封装：get/set/delete/delByPrefix + 降级。
 * Redis 不可用/未启用时静默直查库（不阻塞业务，同 MailService 降级语义）。
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly enabledFlag = true,
  ) {}

  get enabled(): boolean {
    return this.enabledFlag;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.enabled) return undefined;
    try {
      return (await this.cache.get<T>(key)) ?? undefined;
    } catch (err) {
      this.logger.warn(`[Cache] get failed: ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    if (!this.enabled || value == null) return;
    try {
      await this.cache.set(key, value, ttlMs);
    } catch (err) {
      this.logger.warn(`[Cache] set failed: ${(err as Error).message}`);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.cache.del(key);
    } catch (err) {
      this.logger.warn(`[Cache] delete failed: ${(err as Error).message}`);
    }
  }

  /**
   * 按前缀批量删除（列表缓存失效用，如 events:*）。
   * cache-manager v7 用 Keyv stores，前缀删除取第一个 store 的 client（ioredis）。
   */
  async delByPrefix(prefix: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const stores = (this.cache as unknown as { stores: unknown[] }).stores;
      const first = Array.isArray(stores) ? stores[0] : undefined;
      const client = (first as { client?: { keys(p: string): Promise<string[]>; del(...keys: string[]): Promise<number> } })?.client;
      if (client && typeof client.keys === 'function') {
        const keys = await client.keys(`${prefix}*`);
        if (keys.length > 0) await client.del(...keys);
      }
    } catch (err) {
      this.logger.warn(`[Cache] delByPrefix failed: ${(err as Error).message}`);
    }
  }
}

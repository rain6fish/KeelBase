// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/** 前缀删除所需的最小 Redis 客户端形状（node-redis 子集；避免为取类型而直接依赖 redis 包） */
interface RedisKeyClient {
  scanIterator(opts: { MATCH: string }): AsyncIterable<string>;
  del(keys: string[]): Promise<number>;
}

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
   *
   * cache-manager v7 是 Keyv 系的：`cache.stores[0]` 是 **Keyv 实例**，真正的 Redis 客户端在
   * `stores[0].store.client`（KeyvRedis → node-redis）——**不是** `stores[0].client`（旧写法取不到 → 静默 no-op）。
   * 用 `scanIterator({MATCH})` 而非 `keys()`（后者阻塞 Redis）；node-redis 的 `del` **必须传数组**
   * （spread 只删第一个 key）。内存 store 无 client → 跳过（无前缀删除能力，与既有降级语义一致）。
   */
  async delByPrefix(prefix: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const stores = (this.cache as unknown as { stores?: unknown[] }).stores;
      const keyv = Array.isArray(stores) ? stores[0] : undefined;
      const adapter = (keyv as { store?: unknown } | undefined)?.store;
      const client = (adapter as { client?: RedisKeyClient } | undefined)?.client ?? (adapter as { _client?: RedisKeyClient } | undefined)?._client;
      if (!client || typeof client.scanIterator !== 'function') return;

      const keys: string[] = [];
      for await (const k of client.scanIterator({ MATCH: `${prefix}*` })) keys.push(String(k));
      if (keys.length > 0) await client.del(keys);
    } catch (err) {
      this.logger.warn(`[Cache] delByPrefix failed: ${(err as Error).message}`);
    }
  }
}

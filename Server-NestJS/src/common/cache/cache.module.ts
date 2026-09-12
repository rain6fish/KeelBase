// SPDX-License-Identifier: Apache-2.0

import { Logger, Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

const cacheLogger = new Logger('CacheModule');

/**
 * 构造 cache-manager 选项（导出以便单测直接断言 store 形状）。
 *
 * ⚠ cache-manager v7 的选项形状是 `stores: [...]`——**没有**顶层 `store` / `url` 键。
 * 旧写法 `{ store: redisStore, url: redisUrl }` 两个键都被忽略 → 静默落到默认**内存** store：
 * 「配了 REDIS_URL 实际没用上」——多实例下缓存不共享、`delByPrefix` 失效不传播，
 * 例如 `user:<id>`（含 role）会在未参与写的那台实例上陈旧到 TTL。
 * 且 `redisStore` 是**异步工厂**（返回 `Promise<RedisStore>`），必须 await 后放进 `stores`。
 */
export async function buildCacheOptions(
  configService: ConfigService,
): Promise<Record<string, unknown>> {
  const ttl = configService.get<number>('CACHE_TTL', 300);
  if (!configService.get<boolean>('CACHE_ENABLED', true)) {
    // 关闭缓存：默认内存 store 即可（CacheService.enabled=false 会跳过读写）
    return { ttl };
  }
  // 未配 REDIS_URL：内存缓存是**预期**行为，不告警
  const redisUrl = configService.get<string>('REDIS_URL');
  if (!redisUrl) return { ttl };

  // cache-manager v7 是 Keyv 系的：`stores` 只接受 **Keyv 适配器**（get/set/delete/clear）。
  // 用 @keyv/redis 的 createKeyv(url)（Keyv v5 兼容；namespace 为空 → Redis 键不加前缀）。
  // 注意：**不能**用 cache-manager-ioredis-yet@2 的 RedisStore——它只有 del/mdel（无 delete/clear），
  // 放进 stores 会启动即抛 "Invalid storage adapter"（2026-09-12 实测），该依赖已因此移除。
  const { createKeyv } = require('@keyv/redis') as { createKeyv: (url: string) => unknown };
  try {
    const store = createKeyv(redisUrl);
    cacheLogger.log(`缓存使用 Redis store：${redisUrl}`);
    return { stores: [store], ttl };
  } catch (err) {
    // createKeyv 同步失败（URL 非法等）→ 如实告警后降级内存；连接失败是惰性的、由 CacheService 逐次告警
    cacheLogger.warn(
      `REDIS_URL=${redisUrl} 无法建立 Redis store（${(err as Error).message}），降级为进程内内存缓存` +
        `（多实例不共享、delByPrefix 失效不传播）`,
    );
    return { ttl };
  }
}

/**
 * 缓存模块：CACHE_ENABLED（默认开）时用 Redis store（ioredis 适配，连不上则告警降级内存），
 * 关闭时用内存 store。CacheService 暴露 enabled 开关。
 */
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: buildCacheOptions,
    }),
  ],
  providers: [
    {
      provide: CacheService,
      useFactory: (cacheManager: unknown, configService: ConfigService) =>
        new CacheService(
          cacheManager as any,
          configService.get<boolean>('CACHE_ENABLED', true),
        ),
      inject: ['CACHE_MANAGER', ConfigService],
    },
  ],
  exports: [CacheService],
})
export class CacheModule {}

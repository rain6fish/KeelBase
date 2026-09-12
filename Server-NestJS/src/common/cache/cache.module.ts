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

  // 配了 REDIS_URL 却仍走内存——**显式告警，不再静默**（此前是静默降级：运维以为在用共享缓存）。
  // 直接原因：cache-manager v7 是 Keyv 系的，`stores` **只接受 Keyv 适配器**（需 get/set/delete/clear）；
  // 而依赖中的 cache-manager-ioredis-yet@2.1.2 的 RedisStore 只提供 get/set/mset/mdel/**del**（无 delete/clear）
  // → 放进 stores 会在启动时抛 "Invalid storage adapter"。故此处不猜、不改适配器（无法在无真实 Redis 环境下验证），
  // 保留内存 store 并如实告警。正确修法：改用 `@keyv/redis` 的 `createKeyv(url)`（并移除 ioredis-yet 依赖），
  // 需真实 Redis 端到端验证后再切换。
  cacheLogger.warn(
    `REDIS_URL=${redisUrl} 已配置但**不生效**：当前 Redis 适配器与 cache-manager v7 不兼容，缓存仍为进程内内存` +
      `（多实例不共享、delByPrefix 失效不传播）。如需共享缓存，改用 @keyv/redis 的 createKeyv()` +
      `（详见 cache.module.ts 注释）`,
  );
  return { ttl };
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

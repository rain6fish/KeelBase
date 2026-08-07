import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

/**
 * 缓存模块：CACHE_ENABLED && REDIS_URL 可用时用 Redis store（ioredis 适配），
 * 否则用内存 store（仍可降级，不引入外部依赖）。CacheService 暴露 enabled 开关。
 */
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: (configService: ConfigService) => {
        const enabled = configService.get<boolean>('CACHE_ENABLED', true);
        const ttl = configService.get<number>('CACHE_TTL', 300);
        if (!enabled) {
          // 关闭缓存：用最小内存 store，但 CacheService.enabled=false 会跳过读写
          return { ttl, max: 1 } as any;
        }
        const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
         
        const redisStore = require('cache-manager-ioredis-yet');
        return {
          store: redisStore,
          url: redisUrl,
          ttl,
        } as any;
      },
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

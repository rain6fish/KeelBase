import { Controller, Get, Query, Optional, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../auth/guards/public.decorator';
import { SkipMaintenance } from '../settings/skip-maintenance.decorator';
import { STORAGE_SERVICE } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';

/**
 * D.9 公开健康检查：默认轻量（status/uptime），
 * `?detail=true` 追加 db/redis/queue/storage 依赖状态。
 * 依赖探测均超时降级（失败标记 down 不阻断响应），
 * 供负载均衡/监控等无需鉴权的健康检查消费者使用。
 */
@ApiTags('健康检查')
@SkipMaintenance()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Optional() @InjectQueue('push') private readonly pushQueue?: Queue,
    @Optional() @Inject(STORAGE_SERVICE) private readonly storageService?: StorageService,
  ) {}

  @Public()
  @Get()
  // A4：移除全局免限流——detail=true 探测不再可被无限打；60/min 对 LB 常规探活（通常数秒一次）无影响
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: '服务健康检查（?detail=true 含依赖状态）' })
  @ApiQuery({ name: 'detail', required: false, example: 'true', description: '返回 db/redis/queue/storage 依赖状态' })
  async check(@Query('detail') detail?: string) {
    const base = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
    if (detail !== 'true') return base;

    // 依赖探测：全部并行 + 超时降级（任一失败标记 down，不抛错阻断）
    const [database, redis, queue, storage] = await Promise.all([
      this._checkDatabase(),
      this._checkRedis(),
      Promise.resolve(this.pushQueue ? 'up' : 'down'),
      this._checkStorage(),
    ]);

    return {
      ...base,
      dependencies: {
        database,
        redis,
        queue,
        storage,
        storageDriver: this.configService.get<string>('STORAGE_DRIVER', 'local'),
      },
    };
  }

  /**
   * 数据库：SELECT 1。
   * A4：用独立 query runner + 驱动级超时——postgres 上 statement_timeout 让服务端
   * 2s 中止查询，连接不会因客户端 Promise.race 超时仍被长期占用。
   */
  private async _checkDatabase(): Promise<string> {
    const runner = this.dataSource.createQueryRunner();
    const isPostgres = (this.dataSource.options as { type?: string }).type === 'postgres';
    try {
      await runner.connect();
      if (isPostgres) {
        await runner.query(`SET statement_timeout = '2000'`);
      }
      await runner.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    } finally {
      if (isPostgres) {
        // 归还前复位，避免该连接被复用后仍带 2s statement_timeout
        await runner.query(`SET statement_timeout = '0'`).catch(() => undefined);
      }
      await runner.release();
    }
  }

  /** Redis：TCP 探测 REDIS_URL，1.5s 超时；未配置视为 down */
  private async _checkRedis(): Promise<string> {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL', '');
      if (!redisUrl) return 'down';
      const url = new URL(redisUrl);
      const net = await import('net');
      const ok = await new Promise<boolean>((resolve) => {
        const sock = net.createConnection({ host: url.hostname, port: Number(url.port || 6379) }, () => {
          sock.end();
          resolve(true);
        });
        sock.on('error', () => resolve(false));
        sock.setTimeout(1500, () => {
          sock.destroy();
          resolve(false);
        });
      });
      return ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  /** A8：存储健康状态——优先走存储服务探测；未注入（测试/降级）时 local 视为 up、s3 视为 down */
  private async _checkStorage(): Promise<string> {
    if (this.storageService) {
      try {
        return await this.storageService.checkHealth();
      } catch {
        return 'down';
      }
    }
    return this.configService.get<string>('STORAGE_DRIVER', 'local') === 's3'
      ? 'down'
      : 'up';
  }
}

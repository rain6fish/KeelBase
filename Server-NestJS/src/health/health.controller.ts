import { Controller, Get, Query, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../auth/guards/public.decorator';
import { SkipMaintenance } from '../settings/skip-maintenance.decorator';

/**
 * D.9 公开健康检查：默认轻量（status/uptime），
 * `?detail=true` 追加 db/redis/queue/storage 依赖状态。
 * 依赖探测均超时降级（失败标记 down 不阻断响应），
 * 供负载均衡/监控等无需鉴权的健康检查消费者使用。
 */
@ApiTags('健康检查')
@SkipThrottle()
@SkipMaintenance()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Optional() @InjectQueue('push') private readonly pushQueue?: Queue,
  ) {}

  @Public()
  @Get()
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
      Promise.resolve(this.configService.get<string>('STORAGE_DRIVER', 'local')),
    ]);

    return {
      ...base,
      dependencies: { database, redis, queue, storage },
    };
  }

  /** 数据库：SELECT 1，2s 超时；sqlite/postgres 通用 */
  private async _checkDatabase(): Promise<string> {
    try {
      const ok = await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
      ]);
      return ok === false ? 'down' : 'up';
    } catch {
      return 'down';
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
}

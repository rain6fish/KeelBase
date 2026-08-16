import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { STORAGE_SERVICE } from '../storage/storage.service';
import * as net from 'net';

describe('HealthController', () => {
  let controller: HealthController;
  let runner: { connect: jest.Mock; query: jest.Mock; release: jest.Mock };
  let dataSource: { createQueryRunner: jest.Mock; options: { type: string } };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ '1': 1 }]),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      createQueryRunner: jest.fn(() => runner),
      options: { type: 'better-sqlite3' },
    };
    configService = { get: jest.fn((k: string, d?: unknown) => (k === 'STORAGE_DRIVER' ? 'local' : d)) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        // 不提供 STORAGE_SERVICE：走 _checkStorage 的降级分支（local → up）
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return status ok (default lightweight)', async () => {
    const result = await controller.check(undefined);
    expect(result).toHaveProperty('status', 'ok');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('uptime');
    expect(result).not.toHaveProperty('dependencies');
  });

  it('?detail=true should include dependency statuses', async () => {
    const result = await controller.check('true');
    expect(result).toHaveProperty('dependencies');
    expect((result as any).dependencies).toHaveProperty('database', 'up');
    // A8：storage 返回状态值 + 单独 driver 字段
    expect((result as any).dependencies).toHaveProperty('storage', 'up');
    expect((result as any).dependencies).toHaveProperty('storageDriver', 'local');
    expect((result as any).dependencies).toHaveProperty('queue', 'down'); // 未注入 pushQueue
  });

  it('database down should degrade gracefully (not throw)', async () => {
    runner.query.mockRejectedValue(new Error('db down'));
    const result = await controller.check('true');
    expect((result as any).dependencies.database).toBe('down');
  });

  it('postgres uses driver-level statement_timeout then resets it (A4)', async () => {
    dataSource.options = { type: 'postgres' };
    const result = await controller.check('true');
    expect((result as any).dependencies.database).toBe('up');
    // 先 SET statement_timeout 再 SELECT 1，归还前复位
    const queries = runner.query.mock.calls.map((c) => c[0]);
    expect(queries[0]).toBe(`SET statement_timeout = '2000'`);
    expect(queries).toContain('SELECT 1');
    expect(queries[queries.length - 1]).toBe(`SET statement_timeout = '0'`);
  });

  it('postgres db down still releases the query runner (A4)', async () => {
    dataSource.options = { type: 'postgres' };
    runner.query
      .mockResolvedValueOnce(undefined) // SET statement_timeout
      .mockRejectedValueOnce(new Error('db hung')) // SELECT 1 被 statement_timeout 中止
      .mockResolvedValueOnce(undefined); // 复位（失败也会被吞）
    const result = await controller.check('true');
    expect((result as any).dependencies.database).toBe('down');
    expect(runner.release).toHaveBeenCalled();
  });

  // ── 补充覆盖：Redis 降级 / storage 异常 ────────────────────────────────────
  // 注：_checkRedis 的 TCP 探测用 `await import('net')` 动态加载，jest.mock 无法拦截
  // （动态 import 绕过 mock registry），故只覆盖「未配置」「URL 非法」两条降级路径。

  it('_checkRedis：REDIS_URL 非法 → catch 降级 down', async () => {
    configService.get.mockImplementation((k: string, d?: unknown) => (k === 'REDIS_URL' ? 'not-a-valid-url' : d));
    await expect((controller as any)._checkRedis()).resolves.toBe('down');
  });

  it('_checkStorage：storageService 抛错 → down', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: STORAGE_SERVICE, useValue: { checkHealth: jest.fn().mockRejectedValue(new Error('s3 down')) } },
      ],
    }).compile();
    const c = module.get<HealthController>(HealthController);
    await expect((c as any)._checkStorage()).resolves.toBe('down');
  });
});

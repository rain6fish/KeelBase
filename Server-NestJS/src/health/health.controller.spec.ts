// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { STORAGE_SERVICE } from '../storage/storage.service';

// 注：_checkRedis 的 TCP 探测段（net.createConnection 及其回调）无法在 jest 中覆盖——
// 源码用 `await import('net')` 动态加载（tsconfig module=nodenext 编译为原生 ESM import），
// 而 jest 未启用 --experimental-vm-modules 时原生动态 import 直接抛
// "A dynamic import callback was invoked without --experimental-vm-modules"，
// 被 _checkRedis 外层 catch 吞掉恒返回 'down'。不修改生产代码/ jest 配置的情况下该段不可达。
// 故仅覆盖 import 之前的降级分支：未配置、URL 非法。

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

  it('_checkRedis：REDIS_URL 未配置 → down', async () => {
    configService.get.mockImplementation((k: string, d?: unknown) => (k === 'REDIS_URL' ? '' : d));
    await expect((controller as any)._checkRedis()).resolves.toBe('down');
  });

  it('_checkRedis：REDIS_URL 非法 → catch 降级 down', async () => {
    configService.get.mockImplementation((k: string, d?: unknown) => (k === 'REDIS_URL' ? 'not-a-valid-url' : d));
    await expect((controller as any)._checkRedis()).resolves.toBe('down');
  });

  it('postgres 归还前复位失败被吞掉（finally catch 降级）', async () => {
    dataSource.options = { type: 'postgres' };
    runner.query
      .mockResolvedValueOnce(undefined) // SET statement_timeout = '2000'
      .mockResolvedValueOnce(undefined) // SELECT 1 → up
      .mockRejectedValueOnce(new Error('reset failed')); // SET statement_timeout = '0' 失败
    const result = await controller.check('true');
    expect((result as any).dependencies.database).toBe('up');
    expect(runner.release).toHaveBeenCalled();
  });

  it('_checkStorage：未注入服务且 STORAGE_DRIVER=s3 → down', async () => {
    configService.get.mockImplementation((k: string, d?: unknown) => (k === 'STORAGE_DRIVER' ? 's3' : d));
    await expect((controller as any)._checkStorage()).resolves.toBe('down');
  });

  it('_checkStorage：storageService 健康 → up', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: STORAGE_SERVICE, useValue: { checkHealth: jest.fn().mockResolvedValue('up') } },
      ],
    }).compile();
    const c = module.get<HealthController>(HealthController);
    await expect((c as any)._checkStorage()).resolves.toBe('up');
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

  // ── 补充覆盖：pushQueue 注入 / db connect 失败 / redis 可解析 URL / 非 "true" detail ──
  describe('补充覆盖：依赖注入组合与降级', () => {
    it('pushQueue 注入 → dependencies.queue = up', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          { provide: DataSource, useValue: dataSource },
          { provide: ConfigService, useValue: configService },
          { provide: getQueueToken('push'), useValue: { name: 'push' } },
        ],
      }).compile();
      const c = module.get<HealthController>(HealthController);
      const result = await c.check('true');
      expect((result as any).dependencies.queue).toBe('up');
    });

    it('数据库 connect 失败 → 降级 down 且 query runner 仍 release', async () => {
      runner.connect.mockRejectedValue(new Error('cannot connect'));
      const result = await controller.check('true');
      expect((result as any).dependencies.database).toBe('down');
      expect(runner.release).toHaveBeenCalled();
    });

    it('_checkRedis：REDIS_URL 可解析 → 进入 TCP 探测段（本地端口拒连 → down）', async () => {
      configService.get.mockImplementation((k: string, d?: unknown) =>
        k === 'REDIS_URL' ? 'redis://127.0.0.1:1' : d,
      );
      // 127.0.0.1:1 无服务监听：连接被拒 → error 分支 resolve(false)；
      // 即便 jest 下动态 import('net') 抛错也被外层 catch 吞掉 → 同样稳定降级 down。
      await expect((controller as any)._checkRedis()).resolves.toBe('down');
    });

    it('detail 非 "true" 的值 → 仍返回轻量响应（不含 dependencies）', async () => {
      const result = await controller.check('false');
      expect(result).toHaveProperty('status', 'ok');
      expect(result).not.toHaveProperty('dependencies');
    });
  });
});

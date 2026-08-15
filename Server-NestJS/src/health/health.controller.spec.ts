import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '1': 1 }]) };
    configService = { get: jest.fn((k: string, d?: unknown) => (k === 'STORAGE_DRIVER' ? 'local' : d)) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
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
    expect((result as any).dependencies).toHaveProperty('storage', 'local');
    expect((result as any).dependencies).toHaveProperty('queue', 'down'); // 未注入 pushQueue
  });

  it('database down should degrade gracefully (not throw)', async () => {
    dataSource.query.mockRejectedValue(new Error('db down'));
    const result = await controller.check('true');
    expect((result as any).dependencies.database).toBe('down');
  });
});

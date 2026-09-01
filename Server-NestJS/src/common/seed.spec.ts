// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { SeedService } from './seed';
import { seedDemoData } from './demo-data';

jest.mock('./demo-data');
const seedDemoDataMock = seedDemoData as jest.MockedFunction<typeof seedDemoData>;

describe('SeedService（开发环境种子）', () => {
  let service: SeedService;
  let usersRepo: { count: jest.Mock; save: jest.Mock };
  let dataSource: { getRepository: jest.Mock };

  const setup = async (nodeEnv: string) => {
    usersRepo = { count: jest.fn(), save: jest.fn() };
    dataSource = { getRepository: jest.fn() };
    const config = { get: jest.fn((k: string, d?: string) => (k === 'NODE_ENV' ? nodeEnv : d)) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SeedService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: ConfigService, useValue: config },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(SeedService);
    jest.clearAllMocks();
    seedDemoDataMock.mockResolvedValue(true);
  };

  it('非 development 环境直接返回（不查库不建号）', async () => {
    await setup('production');
    await service.onApplicationBootstrap();
    expect(usersRepo.count).not.toHaveBeenCalled();
    expect(usersRepo.save).not.toHaveBeenCalled();
  });

  it('已有用户时跳过建号', async () => {
    await setup('development');
    usersRepo.count.mockResolvedValue(3);
    await service.onApplicationBootstrap();
    expect(usersRepo.save).not.toHaveBeenCalled();
    expect(seedDemoDataMock).not.toHaveBeenCalled();
  });

  it('空库创建 alex/admin 演示账号并种入演示数据', async () => {
    await setup('development');
    usersRepo.count.mockResolvedValue(0);
    usersRepo.save.mockImplementation(async (u: any[]) => u.map((x, i) => ({ ...x, id: i + 1 })));

    await service.onApplicationBootstrap();

    expect(usersRepo.save).toHaveBeenCalled();
    const created = usersRepo.save.mock.calls[0][0] as Array<{ username: string; emailVerified?: boolean; role?: unknown }>;
    expect(created[0]).toMatchObject({ username: 'alex', emailVerified: true });
    expect(created[1]).toMatchObject({ username: 'admin', emailVerified: true });
    expect(created[1].role).toBeDefined();
    expect(seedDemoDataMock).toHaveBeenCalledWith(dataSource, { id: 1, username: 'alex' });
  });

  it('演示数据种入失败仅记日志不阻断启动', async () => {
    await setup('development');
    usersRepo.count.mockResolvedValue(0);
    usersRepo.save.mockImplementation(async (u: any[]) => u.map((x, i) => ({ ...x, id: i + 1 })));
    seedDemoDataMock.mockRejectedValue(new Error('seed failed'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('alex 未找到时不种演示数据', async () => {
    await setup('development');
    usersRepo.count.mockResolvedValue(0);
    usersRepo.save.mockResolvedValue([{ username: 'admin', id: 2 }]); // 无 alex
    await service.onApplicationBootstrap();
    expect(seedDemoDataMock).not.toHaveBeenCalled();
  });
});

// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SearchService } from './search.service';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { MODULES_MANIFEST } from '../common/modules/modules-manifest';

describe('SearchService', () => {
  let service: SearchService;
  const eventsService = { search: jest.fn() };
  const usersService = { searchUsers: jest.fn() };
  const moduleRepo = { findAndCount: jest.fn() };
  const dataSource = {
    hasMetadata: jest.fn(() => true),
    getRepository: jest.fn(() => moduleRepo),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRepo.findAndCount.mockResolvedValue([[], 0]);
    dataSource.hasMetadata.mockReturnValue(true);
    dataSource.getRepository.mockReturnValue(moduleRepo);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: EventsService, useValue: eventsService },
        { provide: UsersService, useValue: usersService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('aggregates own events and public users', async () => {
    eventsService.search.mockResolvedValue({
      items: [{ id: 1, title: 'Meeting' }],
      total: 1,
      page: 1,
      limit: 10,
    });
    usersService.searchUsers.mockResolvedValue({
      items: [{ id: 9, username: 'alex', nickname: 'Alex' }],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.searchAll('meet', 5, 1, 10);

    // events 查询带 userId 隔离
    expect(eventsService.search).toHaveBeenCalledWith({ keyword: 'meet', page: 1, limit: 10 }, 5);
    expect(usersService.searchUsers).toHaveBeenCalledWith('meet', 1, 10);
    expect(result.events.items).toHaveLength(1);
    expect(result.users.items).toHaveLength(1);
  });

  it('returns empty result for blank query without hitting services', async () => {
    const result = await service.searchAll('   ', 5, 1, 10);

    expect(eventsService.search).not.toHaveBeenCalled();
    expect(usersService.searchUsers).not.toHaveBeenCalled();
    expect(result.events.items).toEqual([]);
    expect(result.users.items).toEqual([]);
  });

  // ── P0-9a：声明了 search 的生成模块进索引 ────────────────────────────────────

  it('P0-9a：清单里声明 search 的模块被查询，且每子句都带 owner 过滤（不静默放宽）', async () => {
    eventsService.search.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    usersService.searchUsers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    moduleRepo.findAndCount.mockResolvedValue([[{ id: 3, title: 'Dune' }], 1]);

    const result = await service.searchAll('Dune', 7, 1, 10);

    // 只查清单里声明了 search 的模块；实体名取自清单（故平台侧无需 import 生成物）
    const books = MODULES_MANIFEST.find((e) => e.id === 'books');
    expect(books?.search).toBeDefined();
    expect(dataSource.getRepository).toHaveBeenCalledTimes(1);
    expect(dataSource.getRepository).toHaveBeenCalledWith(books!.search!.entity);

    const arg = moduleRepo.findAndCount.mock.calls[0][0] as {
      where: Record<string, any>[];
      skip: number;
      take: number;
    };
    // 每个匹配子句都带 userId —— 未声明组织/部门范围前只按 owner 收窄
    expect(arg.where).toHaveLength(books!.search!.fields.length);
    expect(arg.where.every((w) => w.userId === 7)).toBe(true);
    expect(arg.where[0][books!.search!.fields[0]].value).toBe('%Dune%');
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(10);

    // 分页形状走单源 `paginated()`（含 totalPages）
    expect(result.modules['books']).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
    expect(result.modules['books'].items).toHaveLength(1);
  });

  it('P0-9a：模块被特性开关关掉（实体不在 DataSource）→ 跳过它，其余来源照常', async () => {
    eventsService.search.mockResolvedValue({ items: [{ id: 1 }], total: 1, page: 1, limit: 10 });
    usersService.searchUsers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    dataSource.hasMetadata.mockReturnValue(false);

    const result = await service.searchAll('x', 7, 1, 10);

    expect(dataSource.getRepository).not.toHaveBeenCalled();
    expect(result.modules).toEqual({});
    expect(result.events.items).toHaveLength(1);
  });

  it('P0-9a：limit < 1 被钳制（否则 paginated 的 totalPages 会成 Infinity → JSON null）', async () => {
    eventsService.search.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    usersService.searchUsers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });

    await service.searchAll('x', 7, 1, 0);

    const arg = moduleRepo.findAndCount.mock.calls[0][0] as { take: number };
    expect(arg.take).toBe(1);
  });
});

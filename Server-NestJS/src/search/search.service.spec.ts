// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SearchService } from './search.service';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { Book } from '../books/book.entity';

/**
 * The manifest the service reads is a file on disk, so this spec stands in for that file rather
 * than for the service's behaviour. Everything downstream of it — the entity metadata, the column
 * types, the scope filtering — runs against a **real** driver, because those are exactly the parts
 * a stub would silently agree with.
 *
 * 服务读的清单是磁盘上的一个文件，故本 spec 替代的是那个文件、而不是服务的行为。它下游的一切 ——
 * 实体元数据、列类型、范围过滤 —— 都跑在**真**驱动上，因为那些正是一个桩会无声附和的部分。
 */
let mockManifestJson: string | null = null;

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const isManifest = (p: unknown): boolean => String(p).endsWith('manifest.json');
  return {
    ...actual,
    existsSync: (p: unknown) => (isManifest(p) ? mockManifestJson !== null : actual.existsSync(p)),
    readFileSync: (p: unknown, ...rest: unknown[]) =>
      isManifest(p) ? mockManifestJson : actual.readFileSync(p, ...(rest as [])),
  };
});

/** The manifest as the generator writes it: which modules are searchable, and which columns. */
/* 生成器写出来的那份清单：哪些模块可搜、以及哪些列。 */
function manifestDeclaring(...searchableModules: Array<{ module: string; fields: string[] }>): string {
  return JSON.stringify({
    schema: 1,
    identity: 'keelbase-application',
    generator: 'keelbase',
    generatorVersion: '0.9.1',
    protocol: '1.1',
    modules: searchableModules.map((m) => m.module),
    searchableModules,
  });
}

const BOOKS = { module: 'books', fields: ['title', 'author'] };

describe('SearchService', () => {
  const eventsService = { search: jest.fn() };
  const usersService = { searchUsers: jest.fn() };
  /** Enabled unless a case says otherwise — the platform's own default read of a flag key. */
  /* 缺省开启，除非某个用例另有说明 —— 与平台读这些键的默认方式一致。 */
  const featureFlags = { isEnabled: jest.fn(() => true) };
  let dataSource: DataSource;
  let service: SearchService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Book],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    featureFlags.isEnabled.mockReturnValue(true);
    mockManifestJson = null;
    await dataSource.getRepository(Book).clear();

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: EventsService, useValue: eventsService },
        { provide: UsersService, useValue: usersService },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: FeatureFlagsService, useValue: featureFlags },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  async function seedBooks(rows: Array<Partial<Book>>): Promise<void> {
    const repo = dataSource.getRepository(Book);
    // `author` is NOT NULL on the real entity; default it so each case only states what it is about.
    // `author` 在真实实体上是 NOT NULL；给个缺省，好让每个用例只写它关心的那部分。
    await repo.save(rows.map((r) => repo.create({ author: 'Anon', ...r })));
  }

  it('aggregates own events and public users', async () => {
    const result = await service.searchAll('meet', 5, 1, 10);

    // events 查询带 userId 隔离
    expect(eventsService.search).toHaveBeenCalledWith({ keyword: 'meet', page: 1, limit: 10 }, 5);
    expect(usersService.searchUsers).toHaveBeenCalledWith('meet', 1, 10);
    expect(result.events.items).toHaveLength(1);
    expect(result.users.items).toHaveLength(1);
    // No module declared searchable → an empty bucket, not a missing field.
    // 没声明任何可搜模块 → 空桶，而不是缺字段。
    expect(result.modules).toEqual([]);
  });

  it('returns empty result for blank query without hitting services', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    await seedBooks([{ title: 'Clean Code', userId: 5 }]);

    const result = await service.searchAll('   ', 5, 1, 10);

    expect(eventsService.search).not.toHaveBeenCalled();
    expect(usersService.searchUsers).not.toHaveBeenCalled();
    expect(result.events.items).toEqual([]);
    expect(result.users.items).toEqual([]);
    expect(result.modules).toEqual([]);
  });

  it('清单声明可搜的模块 → 命中本人记录，并带上模块名与总数', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    await seedBooks([
      { title: 'Clean Code', author: 'Robert Martin', userId: 5 },
      { title: 'Refactoring', author: 'Martin Fowler', userId: 5 },
    ]);

    const result = await service.searchAll('clean', 5, 1, 10);

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].module).toBe('books');
    expect(result.modules[0].total).toBe(1);
    expect(result.modules[0].items).toHaveLength(1);
    expect(result.modules[0].items[0]).toMatchObject({ title: 'Clean Code', userId: 5 });
    // The bucket is the shared paginated shape, not a bespoke `{ items, total }` — `totalPages` is
    // what the helper adds and a hand-rolled bucket would forget.
    // 桶用的是共用分页形状，而不是另造的 `{ items, total }` —— `totalPages` 正是助手补上的那个字段，
    // 手搓的桶会漏掉它。
    expect(result.modules[0]).toMatchObject({ page: 1, limit: 10, totalPages: 1 });
  });

  it('按数据范围过滤：他人记录不出现，即使关键词命中', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    await seedBooks([
      { title: 'Clean Code', userId: 5 },
      { title: 'Clean Architecture', userId: 6 },
    ]);

    const mine = await service.searchAll('clean', 5, 1, 10);
    const theirs = await service.searchAll('clean', 6, 1, 10);

    // Same keyword, two callers: each sees only its own row — and only its own row is counted.
    // 同一关键词、两个调用方：各自只看到自己那一行，总数也只数自己那一行。
    expect(mine.modules[0].items.map((b) => (b as { title: string }).title)).toEqual(['Clean Code']);
    expect(mine.modules[0].total).toBe(1);
    expect(theirs.modules[0].items.map((b) => (b as { title: string }).title)).toEqual([
      'Clean Architecture',
    ]);
    expect(theirs.modules[0].total).toBe(1);
  });

  it('匹配所有文本列，不只标题（作者命中也要出）', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    await seedBooks([{ title: 'Clean Code', author: 'Robert Martin', userId: 5 }]);

    expect((await service.searchAll('Fowler', 5, 1, 10)).modules[0].items).toHaveLength(0);
    expect((await service.searchAll('Martin', 5, 1, 10)).modules[0].items).toHaveLength(1);
  });

  it('只匹配声明的列：把 status 从声明里去掉，就不再按它命中', async () => {
    // `status` is a text column at the database level, and the previous implementation matched it
    // because it matched *every* text column. Declared columns are the point: a module says which
    // of its fields search may touch, and a status is not free text.
    // `status` 在数据库层确实是文本列，而上一版实现会匹配它 —— 因为它匹配**所有**文本列。声明列才是
    // 本意：模块自己说哪些字段可被搜，而状态不是自由文本。
    mockManifestJson = manifestDeclaring({ module: 'books', fields: ['author'] });
    await seedBooks([{ title: 'Clean Code', author: 'Robert Martin', userId: 5 }]);

    expect((await service.searchAll('Clean', 5, 1, 10)).modules[0].items).toHaveLength(0);
    expect((await service.searchAll('Martin', 5, 1, 10)).modules[0].items).toHaveLength(1);
  });

  it('模块的 feature flag 关掉 → 不进搜索（它的端点此时已经 404）', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    await seedBooks([{ title: 'Clean Code', userId: 5 }]);
    featureFlags.isEnabled.mockReturnValue(false);

    const result = await service.searchAll('clean', 5, 1, 10);

    // 其余两半照常：关掉一个模块不该让整次搜索变成空
    expect(result.modules).toEqual([]);
    expect(result.events.items).toHaveLength(1);
    expect(result.users.items).toHaveLength(1);
  });

  it('软删的记录不进搜索结果，且 total 与 items 同口径', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    const repo = dataSource.getRepository(Book);
    const kept = await repo.save(repo.create({ title: 'Clean Code', author: 'Anon', userId: 5 }));
    const gone = await repo.save(repo.create({ title: 'Clean Coder', author: 'Anon', userId: 5 }));
    await repo.softDelete(gone.id);

    const result = await service.searchAll('clean', 5, 1, 10);

    expect(result.modules[0].items.map((b) => (b as { id: number }).id)).toEqual([kept.id]);
    // `total` counts by the same rule as `items` — otherwise paging walks into empty pages.
    // total 与 items 同口径 —— 否则翻页会翻出空页。
    expect(result.modules[0].total).toBe(1);
  });

  it('limit 生效，且 total 是范围内命中总数（不是本页条数）', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    await seedBooks(Array.from({ length: 3 }, (_, i) => ({ title: `Clean Code ${i}`, userId: 5 })));

    const result = await service.searchAll('clean', 5, 1, 2);

    expect(result.modules[0].items).toHaveLength(2);
    expect(result.modules[0].total).toBe(3);
    // 3 rows over pages of 2 → 2 pages, and `limit` is the clamped one that was actually applied
    // 3 行按每页 2 条 → 2 页；`limit` 报的是真正生效的那个（钳后）
    expect(result.modules[0]).toMatchObject({ page: 1, limit: 2, totalPages: 2 });
  });

  it('page/limit 在入口钳一次：limit=0 不会让 totalPages 变成 NaN（JSON 里是 null）', async () => {
    mockManifestJson = manifestDeclaring(BOOKS);
    await seedBooks([{ title: 'Clean Code', userId: 5 }]);

    const result = await service.searchAll('clean', 5, 0, 0);

    expect(result.modules[0]).toMatchObject({ page: 1, limit: 1, totalPages: 1 });
    expect(result.events.totalPages).toBe(1);
    // 下游拿到的是钳后的值，不是原始入参
    expect(eventsService.search).toHaveBeenCalledWith({ keyword: 'clean', page: 1, limit: 1 }, 5);
  });

  it('未声明 searchable 的模块不搜（即使实体存在、记录命中关键词）', async () => {
    mockManifestJson = manifestDeclaring();
    await seedBooks([{ title: 'Clean Code', userId: 5 }]);

    expect((await service.searchAll('clean', 5, 1, 10)).modules).toEqual([]);
  });

  it('manifest 缺失 → 不搜任何模块，其余两半照常', async () => {
    mockManifestJson = null;
    await seedBooks([{ title: 'Clean Code', userId: 5 }]);

    const result = await service.searchAll('clean', 5, 1, 10);

    expect(result.modules).toEqual([]);
    expect(result.events.items).toHaveLength(1);
    expect(result.users.items).toHaveLength(1);
  });
});

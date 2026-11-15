// SPDX-License-Identifier: Apache-2.0

/**
 * typeorm-data-source 是模块级配置（加载 env + 构造 DataSourceOptions），
 * 用 jest.isolateModules 重新加载以分别验证 sqlite / postgres 分支。
 */
describe('typeorm-data-source（DB_TYPE 分支）', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    jest.resetModules();
  });

  it('默认/DB_TYPE=sqlite → better-sqlite3 配置', () => {
    delete process.env.DB_TYPE;
    process.env.DB_PATH = './data/test.sqlite';
    jest.isolateModules(() => {
      const { AppDataSource } = require('./typeorm-data-source');
      expect(AppDataSource.options.type).toBe('better-sqlite3');
      expect((AppDataSource.options as any).database).toContain('test.sqlite');
    });
  });

  it('DB_TYPE=postgres → postgres 配置（含迁移清单）', () => {
    process.env.DB_TYPE = 'postgres';
    process.env.DB_HOST = 'pg-host';
    process.env.DB_NAME = 'keelbase_test';
    jest.isolateModules(() => {
      const { AppDataSource } = require('./typeorm-data-source');
      const opts = AppDataSource.options as any;
      expect(opts.type).toBe('postgres');
      expect(opts.host).toBe('pg-host');
      expect(opts.database).toBe('keelbase_test');
      // postgres 走独立基线迁移清单（sqlite 方言不加载）
      expect(opts.migrations.length).toBeGreaterThan(0);
      expect(opts.migrations.some((m: string) => m.includes('PostgresInitialSchema'))).toBe(true);
    });
  });

  // Regression guard for sqlite-only column types. A column declared `type: 'datetime'` is accepted
  // only by the sqlite driver; the postgres driver throws DataTypeNotSupportedError while building
  // entity metadata, before any SQL runs — which is exactly how the postgres migration job died on
  // ai_tool_result_bodies.expires_at. Building metadata under both dialects here fails in the unit
  // suite instead of in CI, and catches the mirror case too (a postgres-only type under sqlite).
  //
  // 「只有 sqlite 认」的列类型回归守卫：`type: 'datetime'` 这类声明只有 sqlite 驱动接受，postgres
  // 驱动在构建实体 metadata 时（任何 SQL 执行之前）就抛 DataTypeNotSupportedError —— 这正是
  // ai_tool_result_bodies.expires_at 让 postgres 迁移 job 失败的方式。此处按两种方言各构建一次
  // metadata，让这类错误在单测里红，而不是在 CI 里红；反向的情形（只有 postgres 认的类型用在
  // sqlite 上）同样会被抓住。
  describe.each([
    ['sqlite', undefined],
    ['postgres', 'postgres'],
  ])('%s 方言下全部实体的 metadata 可构建', (_label, dbType) => {
    it(`DB_TYPE=${dbType ?? '（默认 sqlite）'} → buildMetadatas 不抛错`, async () => {
      if (dbType === undefined) {
        delete process.env.DB_TYPE;
      } else {
        process.env.DB_TYPE = dbType;
      }
      jest.resetModules();
      const { AppDataSource } = require('./typeorm-data-source');
      await expect(
        (AppDataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas(),
      ).resolves.toBeUndefined();
    }, 30000);
  });
});

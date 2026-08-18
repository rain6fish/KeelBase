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
});

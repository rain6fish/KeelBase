// SPDX-License-Identifier: Apache-2.0

/**
 * governance-data-source 与 typeorm-data-source 同为模块级配置（加载 env + 构造治理台独立 DataSourceOptions）。
 * 用 jest.isolateModules 按分支重新加载，重点验证「治理库名/路径必须独立，绝不回落主库」这一业务规则。
 */
describe('governance-data-source（独立治理库分支）', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    jest.resetModules();
  });

  it('默认/非 postgres → better-sqlite3，库路径独立（GOVERNANCE_DB_PATH）', () => {
    delete process.env.DB_TYPE;
    process.env.GOVERNANCE_DB_PATH = './data/gov-test.sqlite';
    jest.isolateModules(() => {
      const { GovernanceDataSource } = require('./governance-data-source');
      const opts = GovernanceDataSource.options as any;
      expect(opts.type).toBe('better-sqlite3');
      expect(opts.database).toBe('./data/gov-test.sqlite');
      expect(opts.entities.length).toBeGreaterThan(0);
    });
  });

  it('sqlite 未配 GOVERNANCE_DB_PATH → 默认 ./data/governance.sqlite（**不回落主库 DB_PATH**）', () => {
    delete process.env.DB_TYPE;
    delete process.env.GOVERNANCE_DB_PATH;
    process.env.DB_PATH = './data/main.sqlite';
    jest.isolateModules(() => {
      const { GovernanceDataSource } = require('./governance-data-source');
      expect((GovernanceDataSource.options as any).database).toBe('./data/governance.sqlite');
    });
  });

  it('DB_TYPE=postgres → 治理库名独立（缺省 governance，**绝不回落主库 DB_NAME**）', () => {
    process.env.DB_TYPE = 'postgres';
    process.env.DB_NAME = 'front_production';
    delete process.env.GOVERNANCE_DB_NAME;
    jest.isolateModules(() => {
      const { GovernanceDataSource } = require('./governance-data-source');
      const opts = GovernanceDataSource.options as any;
      expect(opts.type).toBe('postgres');
      expect(opts.database).toBe('governance');
    });
  });

  it('postgres 连接回落链：GOVERNANCE_DB_* 优先，其次回落 DB_*', () => {
    process.env.DB_TYPE = 'postgres';
    process.env.DB_HOST = 'main-host';
    process.env.DB_USER = 'main-user';
    process.env.GOVERNANCE_DB_HOST = 'gov-host';
    process.env.GOVERNANCE_DB_PORT = '6543';
    delete process.env.GOVERNANCE_DB_USER;
    jest.isolateModules(() => {
      const { GovernanceDataSource } = require('./governance-data-source');
      const opts = GovernanceDataSource.options as any;
      expect(opts.host).toBe('gov-host');
      expect(opts.port).toBe(6543);
      expect(opts.username).toBe('main-user');
    });
  });

  it('生产环境 synchronize=false（fail fast，防治理库 schema 漂移）', () => {
    process.env.NODE_ENV = 'production';
    jest.isolateModules(() => {
      const { GovernanceDataSource } = require('./governance-data-source');
      expect((GovernanceDataSource.options as any).synchronize).toBe(false);
    });
  });

  it('非生产 synchronize=true（开发/暂存自动建表）', () => {
    process.env.NODE_ENV = 'development';
    jest.isolateModules(() => {
      const { GovernanceDataSource } = require('./governance-data-source');
      expect((GovernanceDataSource.options as any).synchronize).toBe(true);
    });
  });
});

// SPDX-License-Identifier: Apache-2.0

import { ConfigService } from '@nestjs/config';
import { buildTypeOrmOptions } from './typeorm-options';
import { POSTGRES_MIGRATION_GLOBS } from './postgres-migrations';

/**
 * postgres 分支是生产唯一路径（e2e 只跑 sqlite），此前零覆盖。
 * 2026-09-10 该分支的迁移清单漏项导致生产 migrationsRun 不执行（ECS trace 500）——
 * 这里锁住 postgres 清单必须由 POSTGRES_MIGRATION_GLOBS 派生，防再次漂移。
 */
function cfg(map: Record<string, unknown>): ConfigService {
  return { get: (k: string, d?: unknown) => (k in map ? map[k] : d) } as unknown as ConfigService;
}

describe('buildTypeOrmOptions（DB 连接选项工厂）', () => {
  describe('postgres 分支', () => {
    const pgEnv = {
      DB_TYPE: 'postgres',
      NODE_ENV: 'production',
      DB_HOST: 'db.internal',
      DB_PORT: 5432,
      DB_USER: 'app',
      DB_PASSWORD: 'secret',
      DB_NAME: 'prod',
    };

    it('迁移清单由 POSTGRES_MIGRATION_GLOBS 派生（防漂移）', () => {
      const opts = buildTypeOrmOptions(cfg(pgEnv));
      expect(opts.type).toBe('postgres');
      expect(opts.migrations).toEqual(POSTGRES_MIGRATION_GLOBS.map((g) => `dist/migrations/${g}.js`));
      expect((opts.migrations as string[]).length).toBeGreaterThan(0);
    });

    it('含撤销分档迁移（2026-09-10 生产事故回归锁）', () => {
      const opts = buildTypeOrmOptions(cfg(pgEnv));
      const list = opts.migrations as string[];
      expect(list.some((m) => m.includes('AddAiToolSideEffectRevokeColumns'))).toBe(true);
      expect(list.some((m) => m.includes('AddAiConfirmationRunColumns'))).toBe(true);
    });

    it('生产且未开 synchronize → migrationsRun 为 true', () => {
      const opts = buildTypeOrmOptions(cfg(pgEnv));
      expect(opts.migrationsRun).toBe(true);
      expect(opts.synchronize).toBe(false);
    });

    it('DB_SYNCHRONIZE=true → synchronize 开、migrationsRun 关', () => {
      const opts = buildTypeOrmOptions(cfg({ ...pgEnv, DB_SYNCHRONIZE: 'true' }));
      expect(opts.synchronize).toBe(true);
      expect(opts.migrationsRun).toBe(false);
    });

    it('未配 DB_READ_REPLICAS → 单库（带 host/port/凭据）', () => {
      const opts = buildTypeOrmOptions(cfg(pgEnv)) as Record<string, any>;
      expect(opts.replication).toBeUndefined();
      expect(opts.host).toBe('db.internal');
      expect(opts.username).toBe('app');
      expect(opts.database).toBe('prod');
    });

    it('配 DB_READ_REPLICAS → replication.master + slaves（读写分离）', () => {
      const opts = buildTypeOrmOptions(
        cfg({ ...pgEnv, DB_READ_REPLICAS: 'r1:5433, r2:5434' }),
      ) as Record<string, any>;
      expect(opts.replication.master.host).toBe('db.internal');
      expect(opts.replication.slaves).toHaveLength(2);
      expect(opts.replication.slaves[0]).toMatchObject({ host: 'r1', port: 5433, database: 'prod' });
      expect(opts.replication.slaves[1].port).toBe(5434);
    });
  });

  describe('sqlite 分支（默认）', () => {
    it('未配 DB_TYPE → better-sqlite3，全量 glob 迁移', () => {
      const opts = buildTypeOrmOptions(cfg({ NODE_ENV: 'production', DB_PATH: './data/x.sqlite' })) as Record<string, any>;
      expect(opts.type).toBe('better-sqlite3');
      expect(opts.migrations).toEqual(['dist/migrations/*.js']);
      expect(opts.database).toBe('./data/x.sqlite');
      expect(opts.migrationsRun).toBe(true);
    });

    it('development → synchronize 开（自动同步，不跑迁移）', () => {
      const opts = buildTypeOrmOptions(cfg({ NODE_ENV: 'development' }));
      expect(opts.synchronize).toBe(true);
      expect(opts.migrationsRun).toBe(false);
    });
  });
});

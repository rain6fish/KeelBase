// SPDX-License-Identifier: Apache-2.0

import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { LogLevel } from 'typeorm';
import { createTypeOrmLogger } from '../common/tracing/typeorm-tracing.logger';
import { POSTGRES_MIGRATION_GLOBS } from './postgres-migrations';

/**
 * TypeORM 连接选项工厂（从 app.module 抽出以便单测）。
 *
 * postgres 分支是**生产唯一路径**——e2e 只跑 sqlite，故它此前零覆盖；且曾因运行时迁移清单
 * 漏项导致生产 migrationsRun 不执行（ECS /ai/conversations/:id/trace 500）。抽出后由
 * typeorm-options.spec 锁定：postgres 迁移清单必须由 POSTGRES_MIGRATION_GLOBS 派生。
 */
export function buildTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const dbType = configService.get<string>('DB_TYPE', 'sqlite');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isDev = nodeEnv === 'development';
  // 单容器零配置：DB_SYNCHRONIZE=true 时用 synchronize（seed-demo 已建表，幂等），跳过迁移避免冲突
  const useSync = configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true';

  if (dbType === 'postgres') {
    const otelOn = configService.get<string>('OTEL_ENABLED', 'false') === 'true';
    const username = configService.get<string>('DB_USER', 'postgres');
    const password = configService.get<string>('DB_PASSWORD', 'postgres');
    const database = configService.get<string>('DB_NAME', 'front');
    // 3.3 读写分离：DB_READ_REPLICAS 逗号分隔 "host1:5432,host2:5432" →
    // TypeORM replication 自动把读路由到从库、写走主库；未配置 = 单库（向后兼容）。
    const readReplicas = (configService.get<string>('DB_READ_REPLICAS', '') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((addr) => {
        const [rhost, rport] = addr.split(':');
        return { host: rhost, port: parseInt(rport || '5432', 10), username, password, database };
      });
    const common = {
      type: 'postgres' as const,
      autoLoadEntities: true,
      synchronize: isDev || useSync,
      logging: (otelOn ? ['query', 'error'] : ['error', 'warn', 'schema']) as LogLevel[],
      logger: createTypeOrmLogger(otelOn),
      // postgres 用独立基线 + 向量迁移（sqlite 方言迁移不加载）；清单单一源自 config/postgres-migrations
      migrations: POSTGRES_MIGRATION_GLOBS.map((g) => `dist/migrations/${g}.js`),
      migrationsRun: !isDev && !useSync,
      extra: {
        max: configService.get<number>('DB_POOL_MAX', 20),
        min: configService.get<number>('DB_POOL_MIN', 5),
        idleTimeoutMillis: configService.get<number>('DB_POOL_IDLE_TIMEOUT', 30000),
        connectionTimeoutMillis: configService.get<number>('DB_POOL_CONNECTION_TIMEOUT', 2000),
      },
    };
    if (readReplicas.length > 0) {
      // 读写分离：读自动路由到从库（TypeORM replication），写走主库
      return {
        ...common,
        replication: {
          master: {
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 5432),
            username,
            password,
            database,
          },
          slaves: readReplicas,
        },
      } satisfies TypeOrmModuleOptions;
    }
    return {
      ...common,
      host: configService.get<string>('DB_HOST', 'localhost'),
      port: configService.get<number>('DB_PORT', 5432),
      username,
      password,
      database,
    } satisfies TypeOrmModuleOptions;
  }

  const otelOn = configService.get<string>('OTEL_ENABLED', 'false') === 'true';
  return {
    type: 'better-sqlite3' as const,
    autoLoadEntities: true,
    synchronize: isDev || useSync,
    logging: (otelOn ? ['query', 'error'] : ['error', 'warn', 'schema']) as LogLevel[],
    logger: createTypeOrmLogger(otelOn),
    migrations: ['dist/migrations/*.js'],
    migrationsRun: !isDev && !useSync,
    database: configService.get<string>('DB_PATH', './data/front.sqlite'),
  } satisfies TypeOrmModuleOptions;
}

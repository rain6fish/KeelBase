// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddConfirmationAudience1829100000000 } from '../1829100000000-AddConfirmationAudience';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（曾经直接放在 `migrations/` 下 → 迁移链整体崩，见 1823 迁移测试头注释）。
 *
 * 本迁移只加一列，却承载 AUTHZ-1 的目的地绑定，故三条都钉住：
 * ① sqlite 真跑一遍（列在、可写、**既有行逐字段保真**）；
 * ② **postgres 分支发射的方言类型**——本机无 pg 容器时也能验它发射的是 `character varying(64)`
 *    而不是 sqlite 的 `varchar(64)`（方言分派写反 = 生产迁移直接失败，且本地 sqlite 看不出来）；
 * ③ `down()` 真能回滚。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_confirmation_requests" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "token" varchar(64) NOT NULL,
  "tool_name" varchar(64) NOT NULL,
  "args" text NOT NULL,
  "operator_id" varchar NOT NULL,
  "conversation_id" varchar,
  "risk_level" varchar(4) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT ('pending'),
  "approver_id" varchar,
  "decided_at" datetime,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "kind" varchar(16) DEFAULT ('single'),
  "run_items" text,
  "execution_claimed_at" datetime,
  "executed_at" datetime,
  "execution_error" text,
  CONSTRAINT "UQ_2d2d4748c94dd7ffb6a4f541226" UNIQUE ("token"))`;

describe('1829100000000 AddConfirmationAudience（AUTHZ-1 目的地绑定列）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddConfirmationAudience1829100000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_confirmation_requests")`)) as Array<{
      name: string;
    }>;
    return rows.map((r) => r.name);
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    });
    await ds.initialize();
    await ds.query(PRE_STATE_TABLE);
    // 一行带执行轴的既有确认行——加列必须逐字段保真
    await ds.query(
      `INSERT INTO "ai_confirmation_requests" ("id","token","tool_name","args","operator_id","conversation_id","risk_level","status","kind","execution_claimed_at","executed_at") VALUES (3,'tok-3','create_event','{"title":"评审"}','42','conv-3','R3','approved','single',NULL,NULL)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：无 audience 列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).not.toContain('audience');
  });

  it('up()：加一列、既有列全在、既有行逐字段保真', async () => {
    await migration.up(runner);

    expect(await columns()).toContain('audience');

    const rows = (await ds.query(
      `SELECT * FROM "ai_confirmation_requests" ORDER BY "id"`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 3,
      token: 'tok-3',
      tool_name: 'create_event',
      args: '{"title":"评审"}',
      operator_id: '42',
      status: 'approved',
      kind: 'single',
      audience: null, // 迁移前的行没有绑定：null，不是空串
    });
  });

  it('up() 后该列可写可查（目的地标识原样往返）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_confirmation_requests" SET "audience" = 'legacy-erp' WHERE "id" = 3`,
    );
    const row = (await ds.query(
      `SELECT "audience" FROM "ai_confirmation_requests" WHERE "id" = 3`,
    )) as Array<Record<string, unknown>>;
    expect(row[0]).toEqual({ audience: 'legacy-erp' });
  });

  it('down()：回滚掉该列且既有行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).not.toContain('audience');
    const rows = (await ds.query(
      `SELECT "token","status" FROM "ai_confirmation_requests" WHERE "id" = 3`,
    )) as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({ token: 'tok-3', status: 'approved' });
  });

  it('postgres 分支发射 character varying(64)（方言分派写反本地 sqlite 看不出来）', async () => {
    const pgRunner = {
      connection: { options: { type: 'postgres' } },
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await migration.up(pgRunner);

    expect((pgRunner as unknown as { query: jest.Mock }).query).toHaveBeenCalledWith(
      expect.stringContaining('character varying(64)'),
    );
    expect((pgRunner as unknown as { query: jest.Mock }).query).not.toHaveBeenCalledWith(
      expect.stringContaining('"audience" varchar(64)'),
    );
  });
});

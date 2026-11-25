// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddTargetStatusLookupBasis1861000000000 } from '../1861000000000-AddTargetStatusLookupBasis';

/**
 * **This file must stay in `src/migrations/__tests__/`**: the migration glob is non-recursive, so only
 * this subdirectory keeps it next to the migration without TypeORM loading it as one. The migration
 * class is driven through a real QueryRunner. Two points matter: the column is **nullable**, and there
 * is **no backfill** — "the target did not say" and "the row predates the column" both read as
 * `unknown`, so `current_state` must not be stamped onto history.
 *
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob 是非递归的，放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载。
 *
 * 用真实 QueryRunner 驱动迁移类本身，不手抄 SQL。重点两条：加的是**可空**列、**不回填** ——
 * 「目标没说」与「该行早于本列」都读作 `unknown`，不能拿 `current_state` 冒充任何一种。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_target_status_lookups" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "tool_name" varchar(64) NOT NULL,
  "looked_up_by" varchar(64) NOT NULL,
  "as_user_id" varchar(64) NOT NULL,
  "query_method" varchar(8) NOT NULL,
  "query_path" varchar(255) NOT NULL,
  "conclusion" varchar(16) NOT NULL,
  "reason" varchar(32),
  "at" datetime NOT NULL DEFAULT (datetime('now')))`;

const COLUMNS_BEFORE = [
  'id',
  'idempotency_key',
  'tool_name',
  'looked_up_by',
  'as_user_id',
  'query_method',
  'query_path',
  'conclusion',
  'reason',
  'at',
];

describe('1861000000000 AddTargetStatusLookupBasis（R-1 读数种类）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddTargetStatusLookupBasis1861000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_target_status_lookups")`)) as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    return rows.map((r) => r.name);
  };

  const columnInfo = async (name: string) => {
    const rows = (await ds.query(`PRAGMA table_info("ai_target_status_lookups")`)) as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    return rows.find((r) => r.name === name);
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
    await ds.query(
      `INSERT INTO "ai_target_status_lookups"` +
        ` ("id","idempotency_key","tool_name","looked_up_by","as_user_id","query_method","query_path","conclusion","reason")` +
        ` VALUES (1,'key-1','proxy_send','admin-1','7','GET','/status/key-1','not_executed',NULL)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：10 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加一列可空 string，旧列与旧行保真', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'basis']);
    const info = await columnInfo('basis');
    expect(info?.type).toBe('varchar(16)');
    expect(info?.notnull).toBe(0);

    const rows = (await ds.query(
      `SELECT * FROM "ai_target_status_lookups" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      id: 1,
      tool_name: 'proxy_send',
      conclusion: 'not_executed',
      reason: null,
    });
  });

  it('**不回填**：历史行的种类留 NULL（「目标没说」与「早于本列」都读作 unknown）', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "basis" FROM "ai_target_status_lookups" WHERE "id" = 1`,
    )) as Array<{ basis: string | null }>;
    expect(rows[0].basis).toBeNull();
  });

  it('该列可写可查（写入侧按目标声明落值）', async () => {
    await migration.up(runner);
    await ds.query(`UPDATE "ai_target_status_lookups" SET "basis" = ? WHERE "id" = 1`, ['receipt']);

    const rows = (await ds.query(
      `SELECT "basis" FROM "ai_target_status_lookups" WHERE "id" = 1`,
    )) as Array<{ basis: string }>;
    expect(rows[0].basis).toBe('receipt');
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","conclusion" FROM "ai_target_status_lookups" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 1, conclusion: 'not_executed' }]);
  });
});

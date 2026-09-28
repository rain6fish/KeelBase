// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddRevokeComparability1834000000000 } from '../1834000000000-AddRevokeComparability';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。重点：**不回填** —— 引入本列之前撤销的行没有记下
 * 「承诺了却比不到」的差集、也无法重建，故留 `null`，不拿默认值冒充「当时全都比到了」。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_tool_side_effects" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "user_id" varchar NOT NULL,
  "tool_name" varchar(64) NOT NULL,
  "args_hash" varchar(64) NOT NULL,
  "result_type" varchar(64) NOT NULL,
  "result_id" integer NOT NULL,
  "prev_hash" varchar(64),
  "hash" varchar(64),
  "revoke_status" varchar(32),
  "identity_incomplete" boolean NOT NULL DEFAULT (0),
  "undeclared_writes" text,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`;

const COLUMNS_BEFORE = [
  'id',
  'idempotency_key',
  'user_id',
  'tool_name',
  'args_hash',
  'result_type',
  'result_id',
  'prev_hash',
  'hash',
  'revoke_status',
  'identity_incomplete',
  'undeclared_writes',
  'created_at',
];

describe('1834000000000 AddRevokeComparability（REV-14 承诺了却比不到的成员）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddRevokeComparability1834000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_tool_side_effects")`)) as Array<{
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
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","tool_name","args_hash","result_type","result_id","prev_hash","hash","revoke_status")` +
        ` VALUES (1,'key-1','42','create_event','abcd1234','event',7,'deadbeef','cafebabe','revoked')`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：13 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加一列、旧列全在、旧行逐字段保真（含链列）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'revoke_comparability']);

    const rows = (await ds.query(
      `SELECT * FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      id: 1,
      prev_hash: 'deadbeef',
      hash: 'cafebabe',
      revoke_status: 'revoked',
      result_type: 'event',
      result_id: 7,
    });
  });

  it('**不回填**：历史行留 NULL（撤销当时没记、事后无法重建，故不冒充「全都比到了」）', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "revoke_comparability" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ revoke_comparability: string | null }>;
    expect(rows[0].revoke_comparability).toBeNull();
  });

  it('该列可写可查（写侧按实际比对结果落值）', async () => {
    await migration.up(runner);
    const payload = JSON.stringify({
      promised: [{ resultType: 'event', resultId: 7 }],
      uncomparable: [{ resultType: 'event', resultId: 7, reason: 'row_missing' }],
    });
    await ds.query(`UPDATE "ai_tool_side_effects" SET "revoke_comparability" = ? WHERE "id" = 1`, [
      payload,
    ]);

    const rows = (await ds.query(
      `SELECT "revoke_comparability" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ revoke_comparability: string }>;
    expect(JSON.parse(rows[0].revoke_comparability)).toEqual({
      promised: [{ resultType: 'event', resultId: 7 }],
      uncomparable: [{ resultType: 'event', resultId: 7, reason: 'row_missing' }],
    });
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","hash" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 1, hash: 'cafebabe' }]);
  });
});

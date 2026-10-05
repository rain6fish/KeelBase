// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddUndeclaredWrites1833000000001 } from '../1833000000001-AddUndeclaredWrites';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。重点：**不回填** —— 引入本列之前的行是
 * 「没观察到这类写」还是「确实没有」，两者不可区分，故留 `null`，不拿默认值冒充「没有漏记」。
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
  "revoke_claimed_by" varchar(64),
  "agent_id" varchar(64),
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
  'revoke_claimed_by',
  'agent_id',
  'created_at',
];

describe('1833000000000 AddUndeclaredWrites（REV-10 账上没有的写）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddUndeclaredWrites1833000000001();

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

  it('前置形态：14 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加一列、旧列全在、旧行逐字段保真（含链列）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'undeclared_writes']);

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

  it('**不回填**：历史行留 NULL（「没观察到」与「确实没有」不可区分，故不冒充任一）', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "undeclared_writes" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ undeclared_writes: string | null }>;
    expect(rows[0].undeclared_writes).toBeNull();
  });

  it('该列可写可查（写侧按实际观察落值）', async () => {
    await migration.up(runner);
    const payload = JSON.stringify([{ entity: 'CrmTask', id: 9, kind: 'insert' }]);
    await ds.query(`UPDATE "ai_tool_side_effects" SET "undeclared_writes" = ? WHERE "id" = 1`, [
      payload,
    ]);

    const rows = (await ds.query(
      `SELECT "undeclared_writes" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ undeclared_writes: string }>;
    expect(JSON.parse(rows[0].undeclared_writes)).toEqual([
      { entity: 'CrmTask', id: 9, kind: 'insert' },
    ]);
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

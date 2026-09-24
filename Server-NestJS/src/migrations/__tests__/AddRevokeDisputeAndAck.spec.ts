// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddRevokeDisputeAndAck1828000000000 } from '../1828000000000-AddRevokeDisputeAndAck';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（曾经直接放在 `migrations/` 下 → 迁移链整体崩，见 1823 迁移测试头注释）。
 *
 * 本表存的是**哈希链证据行**：加列写错列名/写错方言类型 = 生产迁移直接失败（sqlite 与 pg 都跑这条）。
 * 故用真实 QueryRunner 驱动迁移类本身，不手抄 SQL，避免测试与迁移漂移。
 * 两条断言是重点：新增两列可写；**旧行（含链列）逐字段保真**。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_tool_side_effects" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "user_id" varchar NOT NULL,
  "conversation_id" varchar,
  "run_id" varchar(64),
  "tool_name" varchar(64) NOT NULL,
  "args_hash" varchar(64) NOT NULL,
  "result_type" varchar(64) NOT NULL,
  "result_id" integer NOT NULL,
  "before_snapshot" text,
  "after_snapshot" text,
  "prev_hash" varchar(64),
  "hash" varchar(64),
  "revoke_class" varchar(32),
  "revoke_status" varchar(32),
  "compensation_group" varchar(64),
  "parent_effect_id" integer,
  "revoke_requested_at" datetime,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`;

/** 1827 之后的表形态（本迁移执行前的真实前置状态） */
const COLUMNS_BEFORE = [
  'id',
  'idempotency_key',
  'user_id',
  'conversation_id',
  'run_id',
  'tool_name',
  'args_hash',
  'result_type',
  'result_id',
  'before_snapshot',
  'after_snapshot',
  'prev_hash',
  'hash',
  'revoke_class',
  'revoke_status',
  'compensation_group',
  'parent_effect_id',
  'revoke_requested_at',
  'created_at',
];

describe('1828000000000 AddRevokeDisputeAndAck（REV-1 争议 + REV-2 确认）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddRevokeDisputeAndAck1828000000000();

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
    // 一行链化行（带 hash/prev_hash 与补偿组）—— 加列必须逐列保真
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","tool_name","args_hash","result_type","result_id","prev_hash","hash","revoke_class","revoke_status","compensation_group","parent_effect_id","revoke_requested_at") VALUES (7,'key-7','42','create_project_with_tasks','abcd1234','pm_project',7,'deadbeef','cafebabe','local_compensate','compensating','grp-1',NULL,'2026-09-24 08:00:00')`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：19 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加两列、旧列全在、旧行逐字段保真（含链列与补偿组）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'revoke_dispute', 'revoke_acknowledged_at']);

    const rows = (await ds.query(
      `SELECT * FROM "ai_tool_side_effects" ORDER BY "id"`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 7,
      idempotency_key: 'key-7',
      prev_hash: 'deadbeef',
      hash: 'cafebabe',
      revoke_class: 'local_compensate',
      revoke_status: 'compensating',
      compensation_group: 'grp-1',
      parent_effect_id: null,
      revoke_dispute: null,
      revoke_acknowledged_at: null,
    });
  });

  it('up() 后两列可写可查（争议证据 + 确认时刻）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_tool_side_effects" SET "revoke_dispute" = '{"onlyDeclared":[]}', "revoke_acknowledged_at" = '2026-09-24 09:00:00' WHERE "id" = 7`,
    );
    const row = (await ds.query(
      `SELECT "revoke_dispute","revoke_acknowledged_at" FROM "ai_tool_side_effects" WHERE "id" = 7`,
    )) as Array<Record<string, unknown>>;
    expect(row[0]).toEqual({
      revoke_dispute: '{"onlyDeclared":[]}',
      revoke_acknowledged_at: '2026-09-24 09:00:00',
    });
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","hash","revoke_status" FROM "ai_tool_side_effects"`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 7, hash: 'cafebabe', revoke_status: 'compensating' }]);
  });
});

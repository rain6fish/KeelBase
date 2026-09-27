// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddRevokeClaim1831000000000 } from '../1831000000000-AddRevokeClaim';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL，避免测试与迁移漂移。
 * 重点是**历史行读作「无人认领」**：`revoke_claimed_by` 为 NULL 在语义上就是「没人接手」，
 * 这对历史行是**如实**的（确实没人认领过），故这里不需要、也不应该有回填动作 —— 与
 * 1830（成因不可考）的取舍不同：那一条是**真不知道**，这一条是**知道且就是没有**。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_tool_side_effects" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "user_id" varchar NOT NULL,
  "tool_name" varchar(64) NOT NULL,
  "args_hash" varchar(64) NOT NULL,
  "result_type" varchar(64) NOT NULL,
  "result_id" integer NOT NULL,
  "after_snapshot" text,
  "prev_hash" varchar(64),
  "hash" varchar(64),
  "revoke_class" varchar(32),
  "revoke_status" varchar(32),
  "revoke_requested_at" datetime,
  "compensation_group" varchar(64),
  "parent_effect_id" integer,
  "identity_incomplete" boolean NOT NULL DEFAULT (0),
  "identity_incomplete_reason" varchar(32),
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`;

/** 1831 之前的形态（含 1830 加的 `identity_incomplete_reason`） */
const COLUMNS_BEFORE = [
  'id',
  'idempotency_key',
  'user_id',
  'tool_name',
  'args_hash',
  'result_type',
  'result_id',
  'after_snapshot',
  'prev_hash',
  'hash',
  'revoke_class',
  'revoke_status',
  'revoke_requested_at',
  'compensation_group',
  'parent_effect_id',
  'identity_incomplete',
  'identity_incomplete_reason',
  'created_at',
];

describe('1831000000000 AddRevokeClaim（REV-11 谁认领了）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddRevokeClaim1831000000000();

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
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","tool_name","args_hash","result_type","result_id","after_snapshot","prev_hash","hash","revoke_class","revoke_status","revoke_requested_at","compensation_group","parent_effect_id")` +
        ` VALUES (1,'key-1','42','proxy_side_create','abcd1234','proxy_call',7,NULL,'deadbeef','cafebabe','governed_external','compensating','2020-01-01 00:00:00','grp-1',NULL)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：18 列且无认领列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加两列、旧列全在、旧行逐字段保真（含链列与补偿组）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([
      ...COLUMNS_BEFORE,
      'revoke_claimed_by',
      'revoke_claimed_at',
    ]);

    const rows = (await ds.query(
      `SELECT * FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      prev_hash: 'deadbeef',
      hash: 'cafebabe',
      revoke_class: 'governed_external',
      revoke_status: 'compensating',
      compensation_group: 'grp-1',
      parent_effect_id: null,
      after_snapshot: null,
    });
  });

  it('**不回填**：历史行的认领列留 NULL —— 那是「确实没人认领过」，不是「不知道」', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "revoke_claimed_by","revoke_claimed_at" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ revoke_claimed_by: string | null; revoke_claimed_at: string | null }>;
    // 与 1830（成因不可考 ⇒ 也不能编一个默认值）同一取舍方向，但理由不同：
    // 这里 NULL 本身就是正确答案，写任何默认值都会把「无人认领」改写成「有人认领」。
    expect(rows[0].revoke_claimed_by).toBeNull();
    expect(rows[0].revoke_claimed_at).toBeNull();
  });

  it('认领列可写可查（认领动作按实际写值）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_tool_side_effects" SET "revoke_claimed_by" = 'u-admin-1', "revoke_claimed_at" = '2026-09-27 10:00:00' WHERE "id" = 1`,
    );

    const rows = (await ds.query(
      `SELECT "revoke_claimed_by","revoke_status" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ revoke_claimed_by: string; revoke_status: string }>;
    expect(rows[0].revoke_claimed_by).toBe('u-admin-1');
    // 认领不碰补偿读数
    expect(rows[0].revoke_status).toBe('compensating');
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","hash","revoke_status" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 1, hash: 'cafebabe', revoke_status: 'compensating' }]);
  });
});

// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddClaimDecisionBasis1846000000000 } from '../1846000000000-AddClaimDecisionBasis';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。重点：**不回填** —— 引入这两列之前的占位行没有
 * 「当次按什么角色判定」与「哪一版策略放行」，两者都无法重建，故留 `null`；读侧把它们报成 `unknown`。
 *
 * **This file must stay under `src/migrations/__tests__/`**: the migration globs are non-recursive, so
 * a file here sits next to the migrations without being loaded as one. The test drives the migration
 * class through a real QueryRunner instead of copying its SQL. The point is **no backfill**: rows
 * written before these columns carry neither fact, neither can be reconstructed, so both stay `null`
 * and readers report `unknown`.
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_write_claims" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "user_id" varchar NOT NULL,
  "conversation_id" varchar,
  "run_id" varchar(64),
  "tool_name" varchar(64) NOT NULL,
  "args_hash" varchar(64) NOT NULL,
  "agent_id" varchar(64),
  "status" varchar(16) NOT NULL,
  "claimed_at" datetime NOT NULL,
  "settled_at" datetime,
  "effect_id" integer,
  "release_reason" varchar(32),
  "attempts" integer NOT NULL DEFAULT (1),
  "audit_row_id" integer,
  "authorization_ref" varchar(64),
  CONSTRAINT "UQ_ai_write_claims_key" UNIQUE ("idempotency_key"))`;

const COLUMNS_BEFORE = [
  'id',
  'idempotency_key',
  'user_id',
  'conversation_id',
  'run_id',
  'tool_name',
  'args_hash',
  'agent_id',
  'status',
  'claimed_at',
  'settled_at',
  'effect_id',
  'release_reason',
  'attempts',
  'audit_row_id',
  'authorization_ref',
];

describe('1846000000000 AddClaimDecisionBasis（AW-15 判定依据两列）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddClaimDecisionBasis1846000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_write_claims")`)) as Array<{ name: string }>;
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
      `INSERT INTO "ai_write_claims" ("id","idempotency_key","user_id","tool_name","args_hash","status","claimed_at","attempts")` +
        ` VALUES (1,'key-1','42','create_event','abcd1234','claimed',datetime('now'),1)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：16 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加两列、旧列全在、旧行逐字段保真', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'decided_role', 'policy_revision']);

    const rows = (await ds.query(`SELECT * FROM "ai_write_claims" WHERE "id" = 1`)) as Array<
      Record<string, unknown>
    >;
    expect(rows[0]).toMatchObject({
      id: 1,
      idempotency_key: 'key-1',
      user_id: '42',
      tool_name: 'create_event',
      status: 'claimed',
    });
  });

  it('**不回填**：历史行两列皆 NULL（旧写没有这两个事实，也不拿默认值冒充）', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "decided_role", "policy_revision" FROM "ai_write_claims" WHERE "id" = 1`,
    )) as Array<{ decided_role: string | null; policy_revision: string | null }>;
    expect(rows[0].decided_role).toBeNull();
    expect(rows[0].policy_revision).toBeNull();
  });

  it('两列可写可查（写侧按实际值落）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_write_claims" SET "decided_role" = 'admin', "policy_revision" = 'ab12cd34ef56' WHERE "id" = 1`,
    );

    const rows = (await ds.query(
      `SELECT "decided_role", "policy_revision" FROM "ai_write_claims" WHERE "id" = 1`,
    )) as Array<{ decided_role: string; policy_revision: string }>;
    expect(rows[0]).toEqual({ decided_role: 'admin', policy_revision: 'ab12cd34ef56' });
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","status" FROM "ai_write_claims" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 1, status: 'claimed' }]);
  });
});

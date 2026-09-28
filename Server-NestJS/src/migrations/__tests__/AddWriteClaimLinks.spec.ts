// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddWriteClaimLinks1836000000001 } from '../1836000000001-AddWriteClaimLinks';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。重点：**不回填** —— 引入这两列之前的占位行没有
 * 「它的审计行在哪」与「它依据哪次授权」，两者都无法重建，故留 `null`；证据根对它们继续走保守配对，
 * 而 `authorization_ref` 的 `null` 含义是「没有授权参与」，不是「未知」。
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
];

describe('1836000000001 AddWriteClaimLinks（ACT-5 两个消费者）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddWriteClaimLinks1836000000001();

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

  it('前置形态：14 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加两列、旧列全在、旧行逐字段保真', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'audit_row_id', 'authorization_ref']);

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
      `SELECT "audit_row_id", "authorization_ref" FROM "ai_write_claims" WHERE "id" = 1`,
    )) as Array<{ audit_row_id: number | null; authorization_ref: string | null }>;
    expect(rows[0].audit_row_id).toBeNull();
    expect(rows[0].authorization_ref).toBeNull();
  });

  it('两列可写可查（写侧按实际值落）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_write_claims" SET "audit_row_id" = 38172, "authorization_ref" = 'tok-1' WHERE "id" = 1`,
    );

    const rows = (await ds.query(
      `SELECT "audit_row_id", "authorization_ref" FROM "ai_write_claims" WHERE "id" = 1`,
    )) as Array<{ audit_row_id: number; authorization_ref: string }>;
    expect(rows[0]).toEqual({ audit_row_id: 38172, authorization_ref: 'tok-1' });
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

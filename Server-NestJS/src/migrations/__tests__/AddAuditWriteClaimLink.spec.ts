// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddAuditWriteClaimLink1845000000000 } from '../1845000000000-AddAuditWriteClaimLink';

/**
 * **This file must stay in `src/migrations/__tests__/`**: both migration globs (sqlite
 * `../migrations/*{.ts,.js}` and the postgres `POSTGRES_MIGRATION_GLOBS` patterns) are
 * **non-recursive**, so a subdirectory keeps the spec next to its migration without TypeORM loading
 * it as one (same reasoning as the 1829 migration spec).
 *
 * Drives the migration class itself over a real QueryRunner rather than copying its SQL. The point is
 * **no backfill**: rows written before the column have no provable claim, so they stay `NULL` and
 * readers report them as `unlinked`.
 *
 * **本文件必须留在 `src/migrations/__tests__/`**：两条迁移 glob（sqlite 的 `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）都是**非递归**的，放在子目录才能既与迁移同处、又不被
 * TypeORM 当迁移加载（同 1829 迁移测试的理由）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。重点是**不回填**：引入本列之前的行没有可证明的占位关系，
 * 故保持 `NULL`，读侧如实报 `unlinked`。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_audit_logs" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "user_id" varchar NOT NULL,
  "conversation_id" varchar,
  "action" varchar(32) NOT NULL,
  "detail" text,
  "is_error" boolean NOT NULL DEFAULT (0))`;

const COLUMNS_BEFORE = ['id', 'user_id', 'conversation_id', 'action', 'detail', 'is_error'];

describe('1845000000000 AddAuditWriteClaimLink（AW-11 正向边）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddAuditWriteClaimLink1845000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_audit_logs")`)) as Array<{ name: string }>;
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
      `INSERT INTO "ai_audit_logs" ("id","user_id","conversation_id","action","detail","is_error")` +
        ` VALUES (27,'42','8fa3','tool_call','create_followup_task({...})',0)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：6 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加一列、旧列全在、旧行逐字段保真', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'write_claim_id']);

    const rows = (await ds.query(`SELECT * FROM "ai_audit_logs" WHERE "id" = 27`)) as Array<
      Record<string, unknown>
    >;
    expect(rows[0]).toMatchObject({
      id: 27,
      user_id: '42',
      conversation_id: '8fa3',
      action: 'tool_call',
    });
  });

  it('列形状：integer 且可空（与实体声明的 `{ type: integer, nullable: true }` 对齐）', async () => {
    await migration.up(runner);

    const cols = (await ds.query(`PRAGMA table_info("ai_audit_logs")`)) as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    const added = cols.find((c) => c.name === 'write_claim_id');
    // SQLite echoes the declared type uppercased (`INTEGER`), so compare case-insensitively.
    // sqlite 回报声明类型时统一大写（`INTEGER`），故按大小写无关比较。
    expect(added?.type.toLowerCase()).toBe('integer');
    expect(added?.notnull).toBe(0);
  });

  it('**不回填**：历史行（如本记录 #27）保持 NULL —— 不按工具名 + 时间猜', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "write_claim_id" FROM "ai_audit_logs" WHERE "id" = 27`,
    )) as Array<{ write_claim_id: number | null }>;
    expect(rows[0].write_claim_id).toBeNull();
  });

  it('新行可写可查（写侧按实际值落）', async () => {
    await migration.up(runner);
    await ds.query(`UPDATE "ai_audit_logs" SET "write_claim_id" = 1 WHERE "id" = 27`);

    const rows = (await ds.query(
      `SELECT "write_claim_id" FROM "ai_audit_logs" WHERE "id" = 27`,
    )) as Array<{ write_claim_id: number }>;
    expect(rows[0].write_claim_id).toBe(1);
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","action" FROM "ai_audit_logs" WHERE "id" = 27`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 27, action: 'tool_call' }]);
  });
});

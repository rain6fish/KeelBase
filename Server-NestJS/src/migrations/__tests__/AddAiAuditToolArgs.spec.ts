// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddAiAuditToolArgs1845000000000 } from '../1845000000000-AddAiAuditToolArgs';

/**
 * **This file must stay in `src/migrations/__tests__/`**: the migration globs (sqlite
 * `../migrations/*{.ts,.js}` and postgres `POSTGRES_MIGRATION_GLOBS`) are non-recursive, so a file
 * here sits beside the migrations without TypeORM ever loading it as one.
 *
 * P0-19 的这列是「什么被做了」的结构化答案，故钉三件：① sqlite 真跑一遍，既有行逐字段保真、历史行留
 * null；② 值原样往返（**不截断**是这列的设计，截断会写出假装可解析的半截 JSON）；③ `down()` 真能回滚。
 *
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob 是**非递归**的，只有放进子目录才能既与迁移
 * 同处、又不被 TypeORM 当迁移加载。
 */
const PRE_STATE_TABLE = `CREATE TABLE "ai_audit_logs" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "user_id" varchar NOT NULL,
  "action" varchar(32) NOT NULL,
  "detail" text,
  "is_error" boolean NOT NULL DEFAULT (0),
  "authorization" text,
  "outcome" varchar(32),
  "tool" varchar(64),
  "created_at" datetime NOT NULL DEFAULT (datetime('now')))`;

describe('1845000000000 AddAiAuditToolArgs（P0-19 参数列）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddAiAuditToolArgs1845000000000();

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
    // 一条带既有归因列的审计行 —— 加列必须逐字段保真
    await ds.query(
      `INSERT INTO "ai_audit_logs" ("id","user_id","action","detail","is_error","authorization","outcome","tool") VALUES (7,'42','tool_call','delete_customer({"customerId":1})',1,'[{"name":"risk_policy","ok":false}]','blocked','delete_customer')`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：没有 tool_args 列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).not.toContain('tool_args');
  });

  it('up()：加列、既有行逐字段保真、历史行留 null', async () => {
    await migration.up(runner);
    expect(await columns()).toContain('tool_args');

    const rows = (await ds.query(`SELECT * FROM "ai_audit_logs" ORDER BY "id"`)) as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 7,
      user_id: '42',
      action: 'tool_call',
      detail: 'delete_customer({"customerId":1})',
      is_error: 1,
      outcome: 'blocked',
      tool: 'delete_customer',
      // 本列出现之前的行：不可考，null 而不是事后从 detail 里抠出来的值
      tool_args: null,
    });
  });

  it('up() 后该列可写可查，且值原样往返（不截断）', async () => {
    await migration.up(runner);
    const args = JSON.stringify({ customerId: 1, reason: '重复客户' });
    await ds.query(`UPDATE "ai_audit_logs" SET "tool_args" = ? WHERE "id" = 7`, [args]);
    const row = (await ds.query(
      `SELECT "tool_args" FROM "ai_audit_logs" WHERE "id" = 7`,
    )) as Array<Record<string, unknown>>;
    expect(row[0]).toEqual({ tool_args: args });
  });

  it('down()：回滚掉该列且既有行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).not.toContain('tool_args');
    const rows = (await ds.query(
      `SELECT "tool","outcome","detail" FROM "ai_audit_logs" WHERE "id" = 7`,
    )) as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({
      tool: 'delete_customer',
      outcome: 'blocked',
      detail: 'delete_customer({"customerId":1})',
    });
  });
});

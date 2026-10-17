// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddConfirmationRenderProof1843000000000 } from '../1843000000000-AddConfirmationRenderProof';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载。
 *
 * CONF-3 的迁移只加两列，但这两列承载「用户当时看到的是什么」的凭据，故四条都钉住：
 * ① sqlite 真跑一遍（列在、可写、**既有行逐字段保真**、历史行留 null）；② 值原样往返；
 * ③ `down()` 真能回滚；④ postgres 分支发射 `character varying(64)`（方言分派写反本地看不出来）。
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
  "audience" varchar(64),
  "expires_at" datetime,
  CONSTRAINT "UQ_2d2d4748c94dd7ffb6a4f541226" UNIQUE ("token"))`;

describe('1843000000000 AddConfirmationRenderProof（CONF-3 渲染凭据列）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddConfirmationRenderProof1843000000000();

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
    // 一行带既有注解列的确认行——加列必须逐字段保真
    await ds.query(
      `INSERT INTO "ai_confirmation_requests" ("id","token","tool_name","args","operator_id","conversation_id","risk_level","status","kind","audience","expires_at") VALUES (3,'tok-3','create_event','{"title":"评审"}','42','conv-3','R3','approved','single','legacy-erp','2026-10-18 00:00:00')`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：无 render_hash / render_version 列（防迁移与实体两侧各自漂移）', async () => {
    const cols = await columns();
    expect(cols).not.toContain('render_hash');
    expect(cols).not.toContain('render_version');
  });

  it('up()：加两列、既有列全在、既有行逐字段保真、历史行留 null', async () => {
    await migration.up(runner);

    const cols = await columns();
    expect(cols).toContain('render_hash');
    expect(cols).toContain('render_version');

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
      audience: 'legacy-erp',
      // 本列出现之前的行：**不可考**，null 而不是空串或事后重算的值
      render_hash: null,
      render_version: null,
    });
  });

  it('up() 后两列可写可查（哈希与代次原样往返）', async () => {
    await migration.up(runner);
    const hash = 'a'.repeat(64);
    await ds.query(
      `UPDATE "ai_confirmation_requests" SET "render_hash" = ?, "render_version" = ? WHERE "id" = 3`,
      [hash, 'confirmation-preview-v1'],
    );
    const row = (await ds.query(
      `SELECT "render_hash","render_version" FROM "ai_confirmation_requests" WHERE "id" = 3`,
    )) as Array<Record<string, unknown>>;
    expect(row[0]).toEqual({
      render_hash: 'a'.repeat(64),
      render_version: 'confirmation-preview-v1',
    });
  });

  it('down()：回滚掉两列且既有行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    const cols = await columns();
    expect(cols).not.toContain('render_hash');
    expect(cols).not.toContain('render_version');
    const rows = (await ds.query(
      `SELECT "token","status","audience" FROM "ai_confirmation_requests" WHERE "id" = 3`,
    )) as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({ token: 'tok-3', status: 'approved', audience: 'legacy-erp' });
  });

  it('postgres 分支发射 character varying(64)（方言分派写反本地 sqlite 看不出来）', async () => {
    const pgRunner = {
      connection: { options: { type: 'postgres' } },
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await migration.up(pgRunner);

    const query = (pgRunner as unknown as { query: jest.Mock }).query;
    expect(query).toHaveBeenCalledWith(expect.stringContaining('character varying(64)'));
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('varchar(64)'));
  });
});

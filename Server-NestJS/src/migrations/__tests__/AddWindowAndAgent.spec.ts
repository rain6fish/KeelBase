// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddWindowAndAgent1832000000000 } from '../1832000000000-AddWindowAndAgent';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 本迁移一次动**两张表**：确认行加窗口（`expires_at`）、副作用行加 agent 身份（`agent_id`）。
 * 重点：**两列都不回填** —— 引入之前的行，窗口**不可考**（配置可能已变）、agent 可能没有也可能未知；
 * 写任何默认值都会把「不知道」变成「知道」。
 */
const CONFIRMATIONS_BEFORE = `CREATE TABLE "ai_confirmation_requests" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "token" varchar(64) NOT NULL,
  "tool_name" varchar(64) NOT NULL,
  "args" text NOT NULL,
  "operator_id" varchar NOT NULL,
  "conversation_id" varchar,
  "risk_level" varchar(4) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT ('pending'),
  "kind" varchar(16) NOT NULL DEFAULT ('single'),
  "audience" varchar(64),
  "decision_claimed_at" datetime,
  "decided_at" datetime,
  "execution_claimed_at" datetime,
  "executed_at" datetime,
  "execution_error" text,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_ai_confirmation_requests_token" UNIQUE ("token"))`;

const EFFECTS_BEFORE = `CREATE TABLE "ai_tool_side_effects" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "user_id" varchar NOT NULL,
  "tool_name" varchar(64) NOT NULL,
  "args_hash" varchar(64) NOT NULL,
  "result_type" varchar(64) NOT NULL,
  "result_id" integer NOT NULL,
  "revoke_status" varchar(32),
  "identity_incomplete" boolean NOT NULL DEFAULT (0),
  "identity_incomplete_reason" varchar(32),
  "revoke_claimed_by" varchar(64),
  "revoke_claimed_at" datetime,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`;

describe('1832000000000 AddWindowAndAgent（REV-7 窗口 + agent 身份）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddWindowAndAgent1832000000000();

  const columnsOf = async (table: string): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("${table}")`)) as Array<{ name: string }>;
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
    await ds.query(CONFIRMATIONS_BEFORE);
    await ds.query(EFFECTS_BEFORE);
    await ds.query(
      `INSERT INTO "ai_confirmation_requests" ("id","token","tool_name","args","operator_id","risk_level","status")` +
        ` VALUES (1,'tok-1','create_event','{}','42','R3','pending')`,
    );
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","tool_name","args_hash","result_type","result_id")` +
        ` VALUES (1,'key-1','42','create_event','abcd1234','event',7)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：两表都没有新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columnsOf('ai_confirmation_requests')).not.toContain('expires_at');
    expect(await columnsOf('ai_tool_side_effects')).not.toContain('agent_id');
  });

  it('up()：两张表各加一列、旧列全在、旧行保真', async () => {
    await migration.up(runner);

    expect(await columnsOf('ai_confirmation_requests')).toContain('expires_at');
    expect(await columnsOf('ai_tool_side_effects')).toContain('agent_id');

    const conf = (await ds.query(
      `SELECT "token","status","risk_level" FROM "ai_confirmation_requests" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(conf).toEqual([{ token: 'tok-1', status: 'pending', risk_level: 'R3' }]);

    const eff = (await ds.query(
      `SELECT "tool_name","result_type","result_id" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(eff).toEqual([{ tool_name: 'create_event', result_type: 'event', result_id: 7 }]);
  });

  it('**不回填**：两列对历史行都是 NULL —— 窗口不可考、agent 未知，都不用默认值冒充已知', async () => {
    await migration.up(runner);

    const conf = (await ds.query(
      `SELECT "expires_at" FROM "ai_confirmation_requests" WHERE "id" = 1`,
    )) as Array<{ expires_at: string | null }>;
    const eff = (await ds.query(
      `SELECT "agent_id" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ agent_id: string | null }>;
    expect(conf[0].expires_at).toBeNull();
    expect(eff[0].agent_id).toBeNull();
  });

  it('两列可写可查（新行按实际建行时写入）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_confirmation_requests" SET "expires_at" = '2026-09-28 00:00:00' WHERE "id" = 1`,
    );
    await ds.query(`UPDATE "ai_tool_side_effects" SET "agent_id" = 'agent-sub-7' WHERE "id" = 1`);

    const conf = (await ds.query(
      `SELECT "expires_at" FROM "ai_confirmation_requests" WHERE "id" = 1`,
    )) as Array<{ expires_at: string }>;
    const eff = (await ds.query(
      `SELECT "agent_id" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ agent_id: string }>;
    expect(conf[0].expires_at).toContain('2026-09-28');
    expect(eff[0].agent_id).toBe('agent-sub-7');
  });

  it('down()：两列都回落，旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columnsOf('ai_confirmation_requests')).not.toContain('expires_at');
    expect(await columnsOf('ai_tool_side_effects')).not.toContain('agent_id');
    const conf = (await ds.query(
      `SELECT "token" FROM "ai_confirmation_requests" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(conf).toEqual([{ token: 'tok-1' }]);
  });
});

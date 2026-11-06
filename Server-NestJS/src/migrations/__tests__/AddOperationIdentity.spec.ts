// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddOperationIdentity1849000000000 } from '../1849000000000-AddOperationIdentity';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * AW-20 的两处改动各有一半是**索引语义**，所以这里用真 QueryRunner 建真索引来验，而不是只查列名：
 * - `operation_key` 上的**部分唯一索引**只绑 `claimed` 行 —— 在途唯一、落定后允许同参数再来一次；
 * - `possible_duplicate` 是可空注解列，旧行不被回填。
 *
 * **This file must stay under `src/migrations/__tests__/`** (the globs are non-recursive). AW-20's
 * changes are half index semantics, so the test builds the real partial index: uniqueness binds
 * in-flight rows only, a settled row frees the operation, and pre-existing rows are left untouched.
 */
const PRE_STATE_CLAIMS = `CREATE TABLE "ai_write_claims" (
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
  "decided_role" varchar(32),
  "policy_revision" varchar(64),
  CONSTRAINT "UQ_ai_write_claims_key" UNIQUE ("idempotency_key"))`;

const PRE_STATE_EFFECTS = `CREATE TABLE "ai_tool_side_effects" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "idempotency_key" varchar(64) NOT NULL,
  "user_id" varchar NOT NULL,
  "result_type" varchar(64) NOT NULL,
  "result_id" integer NOT NULL)`;

const CLAIM_COLUMNS_BEFORE = [
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
  'decided_role',
  'policy_revision',
];

describe('1849000000000 AddOperationIdentity（AW-20 操作身份 + possible-duplicate）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddOperationIdentity1849000000000();

  const columnsOf = async (table: string): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("${table}")`)) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  };

  const insertClaim = (
    idempotencyKey: string,
    status: string,
    operationKey: string | null,
  ): Promise<unknown> =>
    ds.query(
      `INSERT INTO "ai_write_claims" ("idempotency_key","user_id","tool_name","args_hash","status","claimed_at","attempts","operation_key")` +
        ` VALUES (?, 'u1', 'mcp_send', 'abc', ?, datetime('now'), 1, ?)`,
      [idempotencyKey, status, operationKey],
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    });
    await ds.initialize();
    await ds.query(PRE_STATE_CLAIMS);
    await ds.query(PRE_STATE_EFFECTS);
    await ds.query(
      `INSERT INTO "ai_write_claims" ("id","idempotency_key","user_id","tool_name","args_hash","status","claimed_at","attempts")` +
        ` VALUES (1,'legacy-key','42','create_event','abcd1234','claimed',datetime('now'),1)`,
    );
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","result_type","result_id")` +
        ` VALUES (1,'legacy-effect','42','event',7)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：两表均无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columnsOf('ai_write_claims')).toEqual(CLAIM_COLUMNS_BEFORE);
    expect(await columnsOf('ai_tool_side_effects')).not.toContain('possible_duplicate');
  });

  it('up()：加两列、旧列全在、旧行逐字段保真且**不回填**', async () => {
    await migration.up(runner);

    expect(await columnsOf('ai_write_claims')).toEqual([...CLAIM_COLUMNS_BEFORE, 'operation_key']);
    expect(await columnsOf('ai_tool_side_effects')).toContain('possible_duplicate');

    const claim = (await ds.query(`SELECT * FROM "ai_write_claims" WHERE "id" = 1`)) as Array<
      Record<string, unknown>
    >;
    expect(claim[0]).toMatchObject({
      id: 1,
      idempotency_key: 'legacy-key',
      user_id: '42',
      status: 'claimed',
      // The old row has no operation identity (its original arguments cannot be rebuilt) => NULL, outside the lease.
      // 旧行没有操作身份（原始参数不可重建）⇒ NULL，不参与租约
      operation_key: null,
    });

    const effect = (await ds.query(`SELECT * FROM "ai_tool_side_effects" WHERE "id" = 1`)) as Array<
      Record<string, unknown>
    >;
    expect(effect[0]).toMatchObject({ id: 1, result_type: 'event', result_id: 7, possible_duplicate: null });
  });

  it('租约：同一 operation_key 的两条 `claimed` 行不能并存', async () => {
    await migration.up(runner);

    await insertClaim('claim-a', 'claimed', 'op-1');
    await expect(insertClaim('claim-b', 'claimed', 'op-1')).rejects.toThrow();
  });

  it('租约只绑在途：前一条落定之后，同一 operation_key 可以再次占位', async () => {
    await migration.up(runner);

    await insertClaim('claim-a', 'claimed', 'op-1');
    await ds.query(`UPDATE "ai_write_claims" SET "status" = 'settled' WHERE "idempotency_key" = 'claim-a'`);

    // Settled = this operation is finished; the same parameters may be another legitimate operation.
    // 落定 = 这次操作已结束，相同参数可以是另一次合法操作
    await expect(insertClaim('claim-b', 'claimed', 'op-1')).resolves.toBeDefined();
    // Released (confirmed not persisted) also leaves no lease.
    // 释放（确认未落库）同样不留租约
    await ds.query(`UPDATE "ai_write_claims" SET "status" = 'released' WHERE "idempotency_key" = 'claim-b'`);
    await expect(insertClaim('claim-c', 'claimed', 'op-1')).resolves.toBeDefined();
  });

  it('历史行（operation_key 为 NULL）不互相冲突，也不挡住新行', async () => {
    await migration.up(runner);

    // The old row is already claimed with a NULL operation_key; another NULL claimed row must not conflict.
    // 旧行已是 claimed 且 operation_key 为 NULL；再来一条 NULL 的 claimed 行不应冲突
    await expect(insertClaim('claim-null', 'claimed', null)).resolves.toBeDefined();
    // A claim that does carry an identity is not blocked by the NULL rows either.
    // 有身份的 claimed 行同样不被 NULL 行挡住
    await expect(insertClaim('claim-op', 'claimed', 'op-9')).resolves.toBeDefined();
  });

  it('down()：列与索引一起回落，旧行保真，租约不再生效', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columnsOf('ai_write_claims')).toEqual(CLAIM_COLUMNS_BEFORE);
    expect(await columnsOf('ai_tool_side_effects')).not.toContain('possible_duplicate');

    const rows = (await ds.query(
      `SELECT "id","idempotency_key","status" FROM "ai_write_claims" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 1, idempotency_key: 'legacy-key', status: 'claimed' }]);

    // The index is gone => inserting another claimed row with the same operation_key no longer collides (the column is gone too, so the legacy shape is used).
    // 索引已删 ⇒ 再插一条同 operation_key 的 claimed 行不会撞（该列也已不存在，故按旧形态插入）
    await expect(
      ds.query(
        `INSERT INTO "ai_write_claims" ("idempotency_key","user_id","tool_name","args_hash","status","claimed_at","attempts")` +
          ` VALUES ('claim-z','u1','mcp_send','abc','claimed',datetime('now'),1)`,
      ),
    ).resolves.toBeDefined();
  });
});

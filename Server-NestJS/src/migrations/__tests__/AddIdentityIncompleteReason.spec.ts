// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddIdentityIncompleteReason1830000000000 } from '../1830000000000-AddIdentityIncompleteReason';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL，避免测试与迁移漂移。
 * 重点在**不回填**这一条：历史置标行的成因必须是 `NULL`（「标了但原因不可考」），
 * 而不是任何默认值 —— 写了默认值就等于把「不可考」读成「已知」，正是 F-10d 点名的退化默认值陷阱。
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
  "compensation_group" varchar(64),
  "parent_effect_id" integer,
  "identity_incomplete" boolean NOT NULL DEFAULT (0),
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`;

/** 1830 之前的形态（含 1829 加的 `identity_incomplete`） */
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
  'compensation_group',
  'parent_effect_id',
  'identity_incomplete',
  'created_at',
];

describe('1830000000000 AddIdentityIncompleteReason（REV-13 成因可分）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddIdentityIncompleteReason1830000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_tool_side_effects")`)) as Array<{
      name: string;
    }>;
    return rows.map((r) => r.name);
  };

  const seed = async (id: number, identityIncomplete: number): Promise<void> => {
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","tool_name","args_hash","result_type","result_id","after_snapshot","prev_hash","hash","revoke_class","revoke_status","compensation_group","parent_effect_id","identity_incomplete")` +
        ` VALUES (?,?,'42','create_project_with_tasks','abcd1234','pm_project',?,NULL,'deadbeef','cafebabe','local_compensate','compensating','grp-1',NULL,?)`,
      [id, `key-${id}`, id, identityIncomplete],
    );
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
    // 1 = 已置标（引入成因列之前，原因不可考）；2 = 未置标
    await seed(1, 1);
    await seed(2, 0);
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：16 列且无成因列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加一列、旧列全在、旧行逐字段保真（含链列与补偿组）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'identity_incomplete_reason']);

    const rows = (await ds.query(
      `SELECT * FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      prev_hash: 'deadbeef',
      hash: 'cafebabe',
      revoke_class: 'local_compensate',
      revoke_status: 'compensating',
      compensation_group: 'grp-1',
      parent_effect_id: null,
      after_snapshot: null,
      identity_incomplete: 1,
    });
  });

  it('**不回填**：历史置标行的成因留 NULL（不可考），未置标行也是 NULL —— 两者不用默认值区分', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "id","identity_incomplete","identity_incomplete_reason" FROM "ai_tool_side_effects" ORDER BY "id"`,
    )) as Array<{ id: number; identity_incomplete: number; identity_incomplete_reason: string | null }>;

    // 置标行的成因取决于捕获当时的运行条件，无法从任何落库列重建 ⇒ 如实留空（读侧据
    // `identity_incomplete` 是否有值 + 本列是否为 null 区分「未置标」与「标了但不可考」）
    expect(rows).toEqual([
      { id: 1, identity_incomplete: 1, identity_incomplete_reason: null },
      { id: 2, identity_incomplete: 0, identity_incomplete_reason: null },
    ]);
  });

  it('新行可写可查（登记层按实际成因写值）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_tool_side_effects" SET "identity_incomplete_reason" = 'row_missing' WHERE "id" = 1`,
    );

    const rows = (await ds.query(
      `SELECT "identity_incomplete_reason" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<{ identity_incomplete_reason: string }>;
    expect(rows[0].identity_incomplete_reason).toBe('row_missing');
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","hash","identity_incomplete" FROM "ai_tool_side_effects" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 1, hash: 'cafebabe', identity_incomplete: 1 }]);
  });
});

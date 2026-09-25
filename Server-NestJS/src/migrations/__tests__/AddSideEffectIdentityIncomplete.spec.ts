// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddSideEffectIdentityIncomplete1829000000000 } from '../1829000000000-AddSideEffectIdentityIncomplete';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1828 迁移测试头注释）。
 *
 * 本表存的是**哈希链证据行**：加列写错列名/方言类型 = 生产迁移直接失败（sqlite 与 pg 都跑这条）。
 * 故用真实 QueryRunner 驱动迁移类本身，不手抄 SQL，避免测试与迁移漂移。
 * 三条断言是重点：新列可写；**旧行逐字段保真**；**历史成组行按既存列如实回填标记**（不是凭空给值）。
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
  "revoke_dispute" text,
  "revoke_acknowledged_at" datetime,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`;

/** 1828 之后的表形态（本迁移执行前的真实前置状态） */
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
  'revoke_dispute',
  'revoke_acknowledged_at',
  'created_at',
];

describe('1829000000000 AddSideEffectIdentityIncomplete（REV-6 effect 身份）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddSideEffectIdentityIncomplete1829000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_tool_side_effects")`)) as Array<{
      name: string;
    }>;
    return rows.map((r) => r.name);
  };

  const seed = async (
    id: number,
    group: string | null,
    after: string | null,
  ): Promise<void> => {
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","tool_name","args_hash","result_type","result_id","after_snapshot","prev_hash","hash","revoke_class","revoke_status","compensation_group","parent_effect_id")` +
        ` VALUES (?,?,'42','create_project_with_tasks','abcd1234','pm_project',?,?,'deadbeef','cafebabe','local_compensate','compensating',?,NULL)`,
      [id, `key-${id}`, id, after, group],
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
    // 1 = 成组·有变更快照（身份完整）；2 = 成组·无变更快照（身份不完整）；3 = 单目标行（不属于组）
    await seed(1, 'grp-1', '{"id":7}');
    await seed(2, 'grp-1', null);
    await seed(3, null, null);
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：21 列且无新列（防迁移与实体两侧各自漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：加一列、旧列全在、旧行逐字段保真（含链列与补偿组）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'identity_incomplete']);

    const rows = (await ds.query(
      `SELECT * FROM "ai_tool_side_effects" WHERE "id" = 2`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 2,
      prev_hash: 'deadbeef',
      hash: 'cafebabe',
      revoke_class: 'local_compensate',
      revoke_status: 'compensating',
      compensation_group: 'grp-1',
      parent_effect_id: null,
      before_snapshot: null,
      after_snapshot: null,
      revoke_dispute: null,
      revoke_acknowledged_at: null,
    });
  });

  it('历史行按**既存列**回填标记：成组且无变更快照 → 1；有变更快照 / 单目标行 → 0', async () => {
    await migration.up(runner);

    const rows = (await ds.query(
      `SELECT "id","identity_incomplete" FROM "ai_tool_side_effects" ORDER BY "id"`,
    )) as Array<{ id: number; identity_incomplete: number }>;

    // 只标「本来就缺变更」的成组行——不回填变更本身（当时的变更无法从任何落库列重建），也不误标单目标行
    expect(rows).toEqual([
      { id: 1, identity_incomplete: 0 },
      { id: 2, identity_incomplete: 1 },
      { id: 3, identity_incomplete: 0 },
    ]);
  });

  it('新行默认 0（迁移给的是默认值，不影响后续登记按实际快照写值）', async () => {
    await migration.up(runner);
    await seed(4, 'grp-2', '{"id":9}');

    const rows = (await ds.query(
      `SELECT "identity_incomplete" FROM "ai_tool_side_effects" WHERE "id" = 4`,
    )) as Array<{ identity_incomplete: number }>;
    expect(rows[0].identity_incomplete).toBe(0);

    // 该列可写可查（登记层按实际是否缺变更写值）
    await ds.query(`UPDATE "ai_tool_side_effects" SET "identity_incomplete" = 1 WHERE "id" = 4`);
    const after = (await ds.query(
      `SELECT "identity_incomplete" FROM "ai_tool_side_effects" WHERE "id" = 4`,
    )) as Array<{ identity_incomplete: number }>;
    expect(after[0].identity_incomplete).toBe(1);
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const rows = (await ds.query(
      `SELECT "id","hash","revoke_status" FROM "ai_tool_side_effects" WHERE "id" = 2`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ id: 2, hash: 'cafebabe', revoke_status: 'compensating' }]);
  });
});

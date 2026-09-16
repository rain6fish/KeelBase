// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddSideEffectCompensationGroup1823000000000 } from './1823000000000-AddSideEffectCompensationGroup';

/**
 * sqlite 重建回归：本表存的是**哈希链证据行**，重建写错 = 静默丢数据且破链。
 * 仓内已有此类事故史（见 1818 迁移头注释与 migrations 排序规则），故把「重建后列/索引/行俱在」锁成常绿门禁。
 * 用真实 QueryRunner（better-sqlite3）驱动迁移类本身——不手抄 SQL，避免测试与迁移漂移。
 */
const CONV_INDEX = 'IDX_a7fd30a8bc01dcc1cc89f63d83';
const GROUP_INDEX = 'IDX_ai_tool_side_effects_compensation_group';

/** 1818 之后的表形态（本迁移执行前的真实前置状态） */
const PRE_STATE_TABLE = `CREATE TABLE "ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(64) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, "prev_hash" varchar(64), "hash" varchar(64), "revoke_class" varchar(32), "revoke_status" varchar(32), "run_id" varchar(64), CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`;

const COLUMNS_BEFORE = [
  'id',
  'idempotency_key',
  'user_id',
  'conversation_id',
  'tool_name',
  'args_hash',
  'result_type',
  'result_id',
  'created_at',
  'before_snapshot',
  'after_snapshot',
  'prev_hash',
  'hash',
  'revoke_class',
  'revoke_status',
  'run_id',
];

describe('1823000000000 AddSideEffectCompensationGroup（sqlite 整表重建）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddSideEffectCompensationGroup1823000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("ai_tool_side_effects")`)) as Array<{
      name: string;
    }>;
    return rows.map((r) => r.name);
  };
  const indexNames = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA index_list("ai_tool_side_effects")`)) as Array<{
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
    await ds.query(`CREATE INDEX "${CONV_INDEX}" ON "ai_tool_side_effects" ("conversation_id")`);
    // 两行：一行为历史链化行（带 hash/run_id），一行为普通行——重建必须逐列保真
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","conversation_id","tool_name","args_hash","result_type","result_id","before_snapshot","after_snapshot","prev_hash","hash","revoke_class","revoke_status","run_id") VALUES (7,'key-7','42','conv-7','create_event','abcd1234','event',77,NULL,'{"id":77}','deadbeef','cafebabe','local_compensate','revoked','run-xyz')`,
    );
    await ds.query(
      `INSERT INTO "ai_tool_side_effects" ("id","idempotency_key","user_id","tool_name","args_hash","result_type","result_id") VALUES (9,'key-9','42','create_todo','ef567890','todo',99)`,
    );
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态确认：16 列 + 唯一约束 + conversation 索引，且无新列', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
    expect(await indexNames()).toContain(CONV_INDEX);
    expect(await columns()).not.toContain('compensation_group');
  });

  it('up()：加 2 列、保全部旧列、旧行逐字段保真（含 run_id 与链列）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual([...COLUMNS_BEFORE, 'compensation_group', 'parent_effect_id']);

    const rows = (await ds.query(
      `SELECT * FROM "ai_tool_side_effects" ORDER BY "id"`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 7,
      idempotency_key: 'key-7',
      user_id: '42',
      conversation_id: 'conv-7',
      tool_name: 'create_event',
      args_hash: 'abcd1234',
      result_type: 'event',
      result_id: 77,
      before_snapshot: null,
      after_snapshot: '{"id":77}',
      prev_hash: 'deadbeef',
      hash: 'cafebabe',
      revoke_class: 'local_compensate',
      revoke_status: 'revoked',
      run_id: 'run-xyz',
      compensation_group: null,
      parent_effect_id: null,
    });
    // 未被 1818 之前的列丢失影响的普通行同样保真
    expect(rows[1]).toMatchObject({ id: 9, idempotency_key: 'key-9', result_type: 'todo', result_id: 99 });
  });

  it('up()：唯一约束与两个索引俱在（漏重建索引 = 静默丢索引）', async () => {
    await migration.up(runner);

    const idx = await indexNames();
    expect(idx).toContain(CONV_INDEX);
    expect(idx).toContain(GROUP_INDEX);

    // 唯一约束仍在（重复 idempotency_key 必须被拒）
    await expect(
      ds.query(
        `INSERT INTO "ai_tool_side_effects" ("idempotency_key","user_id","tool_name","args_hash","result_type","result_id") VALUES ('key-9','1','t','h','todo',1)`,
      ),
    ).rejects.toThrow();
  });

  it('up() 后新列可写可查（补偿组落值）', async () => {
    await migration.up(runner);
    await ds.query(
      `UPDATE "ai_tool_side_effects" SET "compensation_group" = 'grp-1', "parent_effect_id" = 7 WHERE "id" = 9`,
    );
    const row = (await ds.query(
      `SELECT "compensation_group","parent_effect_id" FROM "ai_tool_side_effects" WHERE "id" = 9`,
    )) as Array<Record<string, unknown>>;
    expect(row[0]).toEqual({ compensation_group: 'grp-1', parent_effect_id: 7 });
  });

  it('down()：回落原形态且旧行保真', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE);
    const idx = await indexNames();
    expect(idx).toContain(CONV_INDEX);
    expect(idx).not.toContain(GROUP_INDEX);

    const rows = (await ds.query(
      `SELECT "id","run_id","hash" FROM "ai_tool_side_effects" ORDER BY "id"`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      { id: 7, run_id: 'run-xyz', hash: 'cafebabe' },
      { id: 9, run_id: null, hash: null },
    ]);
  });
});

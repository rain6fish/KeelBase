// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddEffectComparabilityHistory1836000000003 } from '../1836000000003-AddEffectComparabilityHistory';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（放进 `migrations/` 下会让迁移链整体崩，2026-09-16 四个 CI job 同因失败）。
 *
 * 用真实 QueryRunner（better-sqlite3）驱动迁移类本身——不手抄 SQL，避免测试与迁移漂移。
 *
 * This file must stay in `src/migrations/__tests__/`: the migration globs are non-recursive, so putting it
 * beside the migrations would make TypeORM load it as one. It drives the migration class through a real
 * QueryRunner rather than restating the SQL, so the test cannot drift from the migration.
 */
const TABLE = 'ai_tool_effect_comparability';
const EFFECT_INDEX = 'IDX_08b03bd0b778a85035c4e4a30e';

const COLUMNS = ['id', 'effect_id', 'checked', 'promised', 'uncomparable', 'at'];

describe('1836000000003 AddEffectComparabilityHistory（REV-17 append-only 历史表）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddEffectComparabilityHistory1836000000003();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("${TABLE}")`)) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  };
  const indexNames = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA index_list("${TABLE}")`)) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  };
  const tableExists = async (): Promise<boolean> => {
    const rows = (await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${TABLE}'`,
    )) as Array<{ name: string }>;
    return rows.length > 0;
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    });
    await ds.initialize();
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：表还不存在（本迁移是建表，不重建既有表）', async () => {
    expect(await tableExists()).toBe(false);
  });

  it('up()：六列俱在 + effect_id 索引（漏索引＝读侧按行取历史会退化成全表扫）', async () => {
    await migration.up(runner);

    expect(await columns()).toEqual(COLUMNS);
    expect(await indexNames()).toContain(EFFECT_INDEX);
  });

  it('up() 后新表可写可查：每次尝试一行，`clean` 行不带集合、`diff` 行带', async () => {
    await migration.up(runner);
    await ds.query(
      `INSERT INTO "${TABLE}" ("effect_id","checked","promised","uncomparable") VALUES (9281,'diff','[{"resultType":"event","resultId":7}]','[{"resultType":"event","resultId":7,"reason":"row_missing"}]')`,
    );
    await ds.query(
      `INSERT INTO "${TABLE}" ("effect_id","checked","promised","uncomparable") VALUES (9281,'clean',NULL,NULL)`,
    );

    const rows = (await ds.query(
      `SELECT "checked","promised","uncomparable" FROM "${TABLE}" WHERE "effect_id" = 9281 ORDER BY "id"`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      {
        checked: 'diff',
        promised: '[{"resultType":"event","resultId":7}]',
        uncomparable: '[{"resultType":"event","resultId":7,"reason":"row_missing"}]',
      },
      { checked: 'clean', promised: null, uncomparable: null },
    ]);
    // `at` 由 DB 默认值填上（@CreateDateColumn 的 sqlite 形态）
    const at = (await ds.query(`SELECT "at" FROM "${TABLE}" ORDER BY "id"`)) as Array<{ at: unknown }>;
    expect(at[0].at).not.toBeNull();
  });

  it('down()：表与索引一并消失', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await tableExists()).toBe(false);
  });
});

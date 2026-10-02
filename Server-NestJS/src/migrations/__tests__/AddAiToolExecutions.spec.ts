// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { AddAiToolExecutions1836100000000 } from '../1836100000000-AddAiToolExecutions';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。本表是**新建表**（不是加列），故断言与前几份不同：
 * 建之前表不存在、建之后列集与可空性逐列相符、**唯一约束真的拦得住**（那是它的全部意义所在）、
 * 删表回落。
 */
const TABLE = 'ai_tool_executions';

const COLUMNS: Array<{ name: string; notnull: number }> = [
  { name: 'id', notnull: 1 },
  { name: 'idempotency_key', notnull: 1 },
  { name: 'user_id', notnull: 1 },
  { name: 'conversation_id', notnull: 0 },
  { name: 'run_id', notnull: 0 },
  { name: 'tool_name', notnull: 1 },
  { name: 'destination', notnull: 0 },
  { name: 'authorization_ref', notnull: 0 },
  { name: 'agent_id', notnull: 0 },
  { name: 'audit_row_id', notnull: 0 },
  { name: 'settled_at', notnull: 0 },
  { name: 'error', notnull: 0 },
  { name: 'created_at', notnull: 1 },
];

describe('1836100000000 AddAiToolExecutions（ACT-5 执行身份）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new AddAiToolExecutions1836100000000();

  const tableExists = async (): Promise<boolean> => {
    const rows = (await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${TABLE}'`,
    )) as Array<{ name: string }>;
    return rows.length > 0;
  };

  const columns = async (): Promise<Array<{ name: string; notnull: number }>> =>
    (await ds.query(`PRAGMA table_info("${TABLE}")`)) as Array<{ name: string; notnull: number }>;

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

  it('up() 之前表不存在（前置于其它用例的前提）', async () => {
    expect(await tableExists()).toBe(false);
  });

  it('up() 建表：列集与可空性逐列相符（防实体与迁移两侧各自漂移）', async () => {
    await migration.up(runner);

    expect(await tableExists()).toBe(true);
    expect((await columns()).map((c) => ({ name: c.name, notnull: c.notnull }))).toEqual(COLUMNS);
  });

  it('**唯一约束拦得住**：同一 idempotency_key 插第二次必失败 —— 它存在的全部意义就是这个', async () => {
    await migration.up(runner);
    const insert = (key: string) =>
      ds.query(
        `INSERT INTO "${TABLE}" ("idempotency_key","user_id","tool_name","created_at")` +
          ` VALUES (?, '42', 'create_event', datetime('now'))`,
        [key],
      );

    await insert('k-1');
    await expect(insert('k-1')).rejects.toThrow(/UNIQUE/i);
    // 不同的键照旧可插
    await insert('k-2');
    const rows = (await ds.query(`SELECT COUNT(*) AS n FROM "${TABLE}"`)) as Array<{ n: number }>;
    expect(rows[0].n).toBe(2);
  });

  it('一行往返保真；未落定的行三列皆 NULL（「认领了但没落定」是可表达的）', async () => {
    await migration.up(runner);
    await ds.query(
      `INSERT INTO "${TABLE}" ("idempotency_key","user_id","conversation_id","run_id","tool_name",` +
        `"destination","authorization_ref","agent_id")` +
        ` VALUES ('k-1','42','conv-1','run-1','create_event','local','tok-1','researcher')`,
    );

    const rows = (await ds.query(`SELECT * FROM "${TABLE}" WHERE "idempotency_key" = 'k-1'`)) as Array<
      Record<string, unknown>
    >;
    expect(rows[0]).toMatchObject({
      user_id: '42',
      conversation_id: 'conv-1',
      run_id: 'run-1',
      tool_name: 'create_event',
      destination: 'local',
      // REV-7 的那条引用：它依据的是哪次授权
      authorization_ref: 'tok-1',
      agent_id: 'researcher',
      // 认领了、还没落定 —— 既没成功也没失败，三列都空
      audit_row_id: null,
      settled_at: null,
      error: null,
    });
  });

  it('down()：整表回落（表不再存在）', async () => {
    await migration.up(runner);
    await migration.down(runner);

    expect(await tableExists()).toBe(false);
  });
});

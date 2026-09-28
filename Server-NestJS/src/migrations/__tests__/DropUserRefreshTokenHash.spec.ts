// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { DropUserRefreshTokenHash1835000000000 } from '../1835000000000-DropUserRefreshTokenHash';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。重点三条：
 * ① **只删该删的** —— `users` 其余列、唯一约束与数据原样保留（这是核心表，删列最容易连带伤到别处）；
 * ② **down() 可回滚成 nullable** —— 值不恢复（无法恢复）；
 * ③ **往返收敛** —— up→down→up 仍回到「无该列」。
 */
const PRE_STATE = [
  `CREATE TABLE "users" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "username" varchar(32) NOT NULL,
    "email" varchar(255) NOT NULL,
    "password" varchar(255) NOT NULL,
    "nickname" varchar(64) NOT NULL,
    "role" varchar(16) NOT NULL DEFAULT ('user'),
    "refresh_token_hash" varchar(512),
    "login_attempts" integer NOT NULL DEFAULT (0),
    "locked_until" datetime,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"),
    CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
  `INSERT INTO "users" ("id","username","email","password","nickname","role","refresh_token_hash","login_attempts")
   VALUES (1,'alex','alex@example.com','hash','Alex','user','deadbeef',3)`,
];

const COLUMNS_BEFORE = [
  'id',
  'username',
  'email',
  'password',
  'nickname',
  'role',
  'refresh_token_hash',
  'login_attempts',
  'locked_until',
  'createdAt',
  'updatedAt',
];

describe('1835000000000 DropUserRefreshTokenHash（只写不读的遗留字段）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new DropUserRefreshTokenHash1835000000000();

  const columns = async (): Promise<string[]> => {
    const rows = (await ds.query(`PRAGMA table_info("users")`)) as Array<{ name: string }>;
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
    for (const sql of PRE_STATE) await ds.query(sql);
    runner = ds.createQueryRunner();
    await runner.connect();
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  it('前置形态：11 列且含 refresh_token_hash（防 pre-state 与实体漂移）', async () => {
    expect(await columns()).toEqual(COLUMNS_BEFORE);
  });

  it('up()：只少该列；其余列、唯一约束与行数据原样保留', async () => {
    await migration.up(runner);

    const after = await columns();
    expect(after).toEqual(COLUMNS_BEFORE.filter((c) => c !== 'refresh_token_hash'));
    expect(after).toContain('login_attempts'); // 相邻列未受牵连

    const rows = (await ds.query(`SELECT * FROM "users" WHERE "id" = 1`)) as Array<
      Record<string, unknown>
    >;
    expect(rows[0]).toMatchObject({
      id: 1,
      username: 'alex',
      email: 'alex@example.com',
      role: 'user',
      login_attempts: 3, // 老值保真：字段删了，但别的字段一个都不许动
    });
    expect(rows[0]).not.toHaveProperty('refresh_token_hash');

    // 唯一约束仍在（列删除不该伤到表级约束）
    await expect(
      ds.query(
        `INSERT INTO "users" ("username","email","password","nickname") VALUES ('alex','other@example.com','h','x')`,
      ),
    ).rejects.toThrow();
  });

  it('down()：列以 nullable 加回（**列序为追加到末尾，非原位**）；值不恢复（无法恢复）', async () => {
    await migration.up(runner);
    await migration.down(runner);

    // ⚠ 双方言的 `ADD COLUMN` 都**追加到末尾**，不还原原位 ⇒ down 之后的列序与原表不同。
    // 故此处按**集合**断言（列序不参与任何判据：全仓按名访问，无 positional 读取）。
    expect([...(await columns())].sort()).toEqual([...COLUMNS_BEFORE].sort());
    expect((await columns()).at(-1)).toBe('refresh_token_hash'); // 追加的事实本身也钉住

    const rows = (await ds.query(
      `SELECT "username","refresh_token_hash","login_attempts" FROM "users" WHERE "id" = 1`,
    )) as Array<Record<string, unknown>>;
    expect(rows[0].username).toBe('alex');
    expect(rows[0].refresh_token_hash).toBeNull(); // 值不恢复 —— 没有任何别处记录过它
    expect(rows[0].login_attempts).toBe(3);
  });

  it('往返收敛：up→down→up 仍回到「无该列」', async () => {
    await migration.up(runner);
    await migration.down(runner);
    await migration.up(runner);

    expect(await columns()).toEqual(COLUMNS_BEFORE.filter((c) => c !== 'refresh_token_hash'));
  });
});

// SPDX-License-Identifier: Apache-2.0

import { DataSource, QueryRunner } from 'typeorm';
import { DropUserRolesTable1834000000001 } from '../1834000000001-DropUserRolesTable';

/**
 * **本文件必须留在 `src/migrations/__tests__/`**：迁移 glob（sqlite `../migrations/*{.ts,.js}` 与
 * postgres 的 `POSTGRES_MIGRATION_GLOBS` 通配项）是**非递归**的，只有放进子目录才能既与迁移同处、
 * 又不被 TypeORM 当迁移加载（见 1829 迁移测试头注释）。
 *
 * 用真实 QueryRunner 驱动迁移类本身、不手抄 SQL。重点三条：
 * ① **只删该删的** —— `roles`（仍在用，见 `role-rule-registry.service.ts`）与 `users` 不受影响；
 * ② **down() 与 1820 同形** —— 约束名与索引一并恢复，否则往返之后会被判为漂移；
 * ③ **往返收敛** —— up→down→up 仍回到「无 user_roles」。
 */
const PRE_STATE = [
  `CREATE TABLE "users" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar(64) NOT NULL)`,
  `CREATE TABLE "roles" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "code" varchar(32) NOT NULL, CONSTRAINT "UQ_roles_code" UNIQUE ("code"))`,
  // 与 1820000000000-AddRolesPermissions 的 sqlite 分支逐字一致
  `CREATE TABLE "user_roles" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "role_id" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_23ed6f04fe43066df08379fd034" UNIQUE ("user_id", "role_id"), CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE, CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE)`,
  `CREATE INDEX "IDX_87b8888186ca9769c960e92687" ON "user_roles" ("user_id")`,
  `INSERT INTO "users" ("id","username") VALUES (1,'alex')`,
  `INSERT INTO "roles" ("id","code") VALUES (1,'admin')`,
  `INSERT INTO "user_roles" ("id","user_id","role_id") VALUES (1,1,1)`,
];

describe('1834000000000 DropUserRolesTable（ROLE-1 删掉无写入方的死表）', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  const migration = new DropUserRolesTable1834000000001();

  const tableSql = async (name: string): Promise<string | null> => {
    const rows = (await ds.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [name],
    )) as Array<{ sql: string | null }>;
    return rows.length ? rows[0].sql : null;
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

  it('前置形态：user_roles 与其索引都在（防 pre-state 与 1820 漂移）', async () => {
    expect(await tableSql('user_roles')).not.toBeNull();
    const idx = (await ds.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
      ['IDX_87b8888186ca9769c960e92687'],
    )) as Array<{ name: string }>;
    expect(idx).toHaveLength(1);
  });

  it('up()：user_roles 消失；roles / users 与它们的数据原样保留', async () => {
    await migration.up(runner);

    expect(await tableSql('user_roles')).toBeNull();
    expect(await tableSql('roles')).not.toBeNull();
    expect(await tableSql('users')).not.toBeNull();

    const roles = (await ds.query(`SELECT "id","code" FROM "roles"`)) as Array<unknown>;
    expect(roles).toEqual([{ id: 1, code: 'admin' }]);
    const users = (await ds.query(`SELECT "id","username" FROM "users"`)) as Array<unknown>;
    expect(users).toEqual([{ id: 1, username: 'alex' }]);
  });

  it('down()：表与唯一约束、索引一并恢复（与 1820 同形，否则往返即漂移）', async () => {
    await migration.up(runner);
    await migration.down(runner);

    const sql = await tableSql('user_roles');
    expect(sql).not.toBeNull();
    expect(sql).toContain('UQ_23ed6f04fe43066df08379fd034');
    expect(sql).toContain('FK_87b8888186ca9769c960e926870');
    const idx = (await ds.query(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
      ['IDX_87b8888186ca9769c960e92687'],
    )) as Array<{ name: string }>;
    expect(idx).toHaveLength(1);
  });

  it('往返收敛：up→down→up 仍回到「无 user_roles」', async () => {
    await migration.up(runner);
    await migration.down(runner);
    await migration.up(runner);

    expect(await tableSql('user_roles')).toBeNull();
  });
});

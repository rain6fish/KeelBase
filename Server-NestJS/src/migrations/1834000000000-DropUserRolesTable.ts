// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ROLE-1: drops `user_roles`, which never had a writer or a reader.
 *
 * `1820000000000-AddRolesPermissions` created it as the "permission-2 Step 2" scaffolding and backfilled
 * it from `users.role`. Nothing has touched it since: `UserRoleAssignment` has zero references anywhere in
 * `src`, so no code path reads it and none writes it. That makes it worse than dead weight — a role change
 * via `PATCH /users/:id/role` moves `users.role` and leaves this mirror behind, so the table silently
 * drifts from the field it mirrors, and a later reader has no way to tell which of the two is current.
 *
 * The authority for a role was never this table: `data-scope.service.ts` and `role.entity.ts` both say the
 * `UserRole` enum is the code-side source of truth. Removing the unused mirror keeps that single.
 *
 * **A new migration, not an edit to 1820.** The older migration may already be applied (postgres ran it for
 * real), and editing an applied migration neither removes the table from an existing database nor records
 * that anything changed. Fresh databases do create the table and then drop it — deliberate, so the migration
 * history stays append-only. `down()` restores it with the exact DDL 1820 used, keeping the cycle symmetric.
 *
 * Timestamp 1834000000000 is later than the newest existing migration 1833000000000.
 *
 * ROLE-1：删掉 `user_roles` —— 这张表从来没有写入方，也没有读者。
 *
 * `1820000000000-AddRolesPermissions` 把它作为「权限-2 Step 2」的脚手架建出来，并按 `users.role` 回填。
 * 此后无人碰过它：`UserRoleAssignment` 在 `src` 里零引用，故没有任何代码路径读它、也没有路径写它。
 * 这比**死重**更糟——经 `PATCH /users/:id/role` 改角色会改 `users.role`，却把这面镜像留在原地，于是它
 * 会**静默偏离它所镜像的字段**，而后来人无从判断两者哪个是当前值。
 *
 * 角色的权威从来不是这张表：`data-scope.service.ts` 与 `role.entity.ts` 都写明 `UserRole` 枚举才是代码侧
 * 的事实来源。删掉这面没人用的镜像，权威就只剩一个。
 *
 * **这是新迁移，不是改 1820。** 旧迁移可能已被执行过（postgres 实跑过），而改一条已执行的迁移既不会从
 * 现有库里删掉该表，也不会留下「有东西变了」的记录。全新库会先建后删——这是有意为之，为的是让迁移历史
 * 保持只追加。`down()` 用 1820 的原 DDL 把它建回来，使往返对称。
 *
 * 时间戳 1834000000000 晚于最新既有迁移 1833000000000。
 */
export class DropUserRolesTable1834000000000 implements MigrationInterface {
  name = 'DropUserRolesTable1834000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 表自己的 FK 随表删除（双向言皆然）；无外部对象依赖它，故不需 CASCADE。
    await queryRunner.query(`DROP TABLE "user_roles"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const q = (sql: string) => queryRunner.query(sql);

    // 与 1820 逐字一致（含约束名），否则 down→up 往返后会被 TypeORM 判为漂移。
    if (isPg) {
      await q(
        `CREATE TABLE "user_roles" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "role_id" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_23ed6f04fe43066df08379fd034" UNIQUE ("user_id", "role_id"), CONSTRAINT "PK_user_roles" PRIMARY KEY ("id"), CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE, CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE)`,
      );
    } else {
      await q(
        `CREATE TABLE "user_roles" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "role_id" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_23ed6f04fe43066df08379fd034" UNIQUE ("user_id", "role_id"), CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE, CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE)`,
      );
    }
    await q(`CREATE INDEX "IDX_87b8888186ca9769c960e92687" ON "user_roles" ("user_id")`);
  }
}

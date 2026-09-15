// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';
import { UserRole } from '../common/entities/user.entity';
import { BUILTIN_ROLE_RULES } from '../common/casl/builtin-role-rules';

/**
 * 权限-2 Step 2：`roles` / `permissions` / `role_permissions` / `user_roles` 四表 + 种子。
 *
 * 种子目标 = **精确复刻改造前的行为**：
 * - 角色两个：`admin`（data_scope=`all`，显式决策）、`user`（data_scope=`own` 为角色默认）
 * - 能力点 = `BUILTIN_ROLE_RULES` 里的每个 subject（单一来源，与工厂回退共用）
 * - 授予 = `BUILTIN_ROLE_RULES` 逐条；`owner_field` / `stringify_owner` 原样落库
 * - **按主体覆盖** `data_scope`：`user` 角色的 `Todo` / `Event` = `org`（改造前这两个是「本人 OR 同组织」），
 *   其余保持角色默认 `own` —— 否则 CRM/PM/Approval 会被**意外放宽**为组织可见。
 * - `user_roles` 按 `users.role` 回填。
 */
export class AddRolesPermissions1820000000000 implements MigrationInterface {
  name = 'AddRolesPermissions1820000000000';

  /** 按主体覆盖的角色默认范围（保持改造前的逐 subject 行为） */
  private static readonly SUBJECT_SCOPE_OVERRIDE: Record<string, string> = {
    Todo: 'org',
    Event: 'org',
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const q = (sql: string) => queryRunner.query(sql);

    if (isPg) {
      await q(`CREATE TABLE "roles" ("id" SERIAL NOT NULL, "code" character varying(32) NOT NULL, "name" character varying(64) NOT NULL, "data_scope" character varying(24) NOT NULL DEFAULT 'own', "custom_dept_ids" text, "is_system" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_roles_code" UNIQUE ("code"), CONSTRAINT "PK_roles" PRIMARY KEY ("id"))`);
      await q(`CREATE TABLE "permissions" ("id" SERIAL NOT NULL, "code" character varying(96) NOT NULL, "subject" character varying(64) NOT NULL, "action" character varying(24) NOT NULL DEFAULT 'manage', "description" character varying(200), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_permissions_code" UNIQUE ("code"), CONSTRAINT "PK_permissions" PRIMARY KEY ("id"))`);
      await q(`CREATE UNIQUE INDEX "IDX_permissions_subject_action" ON "permissions" ("subject", "action")`);
      await q(`CREATE TABLE "role_permissions" ("id" SERIAL NOT NULL, "role_id" integer NOT NULL, "permission_id" integer NOT NULL, "owner_field" character varying(32), "stringify_owner" boolean NOT NULL DEFAULT false, "data_scope" character varying(24), CONSTRAINT "UQ_role_permissions" UNIQUE ("role_id", "permission_id"), CONSTRAINT "PK_role_permissions" PRIMARY KEY ("id"), CONSTRAINT "FK_rp_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE, CONSTRAINT "FK_rp_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") ON DELETE CASCADE)`);
      await q(`CREATE INDEX "IDX_role_permissions_role" ON "role_permissions" ("role_id")`);
      await q(`CREATE TABLE "user_roles" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "role_id" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_user_roles" UNIQUE ("user_id", "role_id"), CONSTRAINT "PK_user_roles" PRIMARY KEY ("id"), CONSTRAINT "FK_ur_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE, CONSTRAINT "FK_ur_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE)`);
      await q(`CREATE INDEX "IDX_user_roles_user" ON "user_roles" ("user_id")`);
    } else {
      await q(`CREATE TABLE "roles" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "code" varchar(32) NOT NULL, "name" varchar(64) NOT NULL, "data_scope" varchar(24) NOT NULL DEFAULT ('own'), "custom_dept_ids" text, "is_system" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_roles_code" UNIQUE ("code"))`);
      await q(`CREATE TABLE "permissions" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "code" varchar(96) NOT NULL, "subject" varchar(64) NOT NULL, "action" varchar(24) NOT NULL DEFAULT ('manage'), "description" varchar(200), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_permissions_code" UNIQUE ("code"))`);
      await q(`CREATE UNIQUE INDEX "IDX_permissions_subject_action" ON "permissions" ("subject", "action")`);
      await q(`CREATE TABLE "role_permissions" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "role_id" integer NOT NULL, "permission_id" integer NOT NULL, "owner_field" varchar(32), "stringify_owner" boolean NOT NULL DEFAULT (0), "data_scope" varchar(24), CONSTRAINT "UQ_role_permissions" UNIQUE ("role_id", "permission_id"), CONSTRAINT "FK_rp_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE, CONSTRAINT "FK_rp_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") ON DELETE CASCADE)`);
      await q(`CREATE INDEX "IDX_role_permissions_role" ON "role_permissions" ("role_id")`);
      await q(`CREATE TABLE "user_roles" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "role_id" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_user_roles" UNIQUE ("user_id", "role_id"), CONSTRAINT "FK_ur_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE, CONSTRAINT "FK_ur_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE)`);
      await q(`CREATE INDEX "IDX_user_roles_user" ON "user_roles" ("user_id")`);
    }

    await this._seed(queryRunner, isPg);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP TABLE "user_roles"`);
    await q(`DROP TABLE "role_permissions"`);
    await q(`DROP INDEX "IDX_permissions_subject_action"`);
    await q(`DROP TABLE "permissions"`);
    await q(`DROP TABLE "roles"`);
  }

  /** 种子：角色 / 能力点 / 授予 / 用户分配（值全部内部推导，占位符按驱动切换）。 */
  private async _seed(queryRunner: QueryRunner, isPg: boolean): Promise<void> {
    const ph = (n: number) => (isPg ? `$${n}` : '?');
    const bool = (v: boolean) => (isPg ? (v ? 'true' : 'false') : v ? '1' : '0');
    const run = (sql: string, params: unknown[]) => queryRunner.query(sql, params);

    const roles: Array<{ code: string; name: string; dataScope: string }> = [
      { code: UserRole.ADMIN, name: '管理员', dataScope: 'all' },
      { code: UserRole.USER, name: '普通用户', dataScope: 'own' },
    ];
    for (const r of roles) {
      await run(
        `INSERT INTO "roles" ("code", "name", "data_scope", "is_system") VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${bool(true)})`,
        [r.code, r.name, r.dataScope],
      );
    }
    const roleIdByCode = new Map<string, number>();
    for (const row of await queryRunner.query(`SELECT "id", "code" FROM "roles"`)) {
      roleIdByCode.set(row.code, Number(row.id));
    }

    const permissionIdBySubject = new Map<string, number>();
    const subjects = [...new Set(BUILTIN_ROLE_RULES.map((r) => r.subject))];
    for (const subject of subjects) {
      await run(
        `INSERT INTO "permissions" ("code", "subject", "action", "description") VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)})`,
        [`${subject.toLowerCase()}.manage`, subject, 'manage', `管理 ${subject}`],
      );
    }
    for (const row of await queryRunner.query(`SELECT "id", "subject" FROM "permissions"`)) {
      permissionIdBySubject.set(row.subject, Number(row.id));
    }

    for (const rule of BUILTIN_ROLE_RULES) {
      const roleId = roleIdByCode.get(rule.roleCode);
      const permissionId = permissionIdBySubject.get(rule.subject);
      if (roleId == null || permissionId == null) continue;
      const override =
        rule.roleCode === UserRole.USER
          ? (AddRolesPermissions1820000000000.SUBJECT_SCOPE_OVERRIDE[rule.subject] ?? null)
          : null;
      await run(
        `INSERT INTO "role_permissions" ("role_id", "permission_id", "owner_field", "stringify_owner", "data_scope") VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${bool(Boolean(rule.stringifyOwner))}, ${ph(4)})`,
        [roleId, permissionId, rule.ownerField, override],
      );
    }

    // 用户 → 角色：按 users.role 回填（枚举仍是事实来源）
    await run(
      `INSERT INTO "user_roles" ("user_id", "role_id") SELECT u."id", r."id" FROM "users" u JOIN "roles" r ON r."code" = u."role"`,
      [],
    );
  }
}

// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * followup_plans 的客户维（业务规格补录的派生取值，见 `.keelbase/interview/followup-plans.md` Q9）。
 *
 * 列名是 `customerId`（camelCase）而不是下划线 —— 生成器对**关联字段**（`relation`）走的是这条路径，
 * 与其它列（`user_id` / `created_at`）不同。这里**照生成物原样**落库，不去手改：改了这一处，
 * 下一次重生成会把实体改回去，而迁移里留着旧名字 —— 那才是真的漂移。
 *
 * 命名注意：本文件**不要**叫 `AddFollowupPlans...` —— `POSTGRES_MIGRATION_GLOBS` 里有
 * `*AddFollowupPlans*`（给建表那条用的通配子串），文件名里带上它会让本迁移被 postgres 链也加载，
 * 于是 sqlite 方言的 `DROP INDEX` 在 pg 上失败、整条 pg 迁移链回滚。
 * The file must NOT be named `AddFollowupPlans...`: that substring is a postgres glob for the create-table
 * migration, and matching it here would run this sqlite-dialect migration on postgres too.
 */
export class AddFollowupPlanCustomerId1833000000000 implements MigrationInterface {
    name = 'AddFollowupPlanCustomerId1833000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "followup_plans" ADD "customerId" integer`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_31abc4aef2940cd4b330480d21"`);
        await queryRunner.query(`CREATE TABLE "temporary_followup_plans" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "customerId" integer, "priority" varchar(32) NOT NULL DEFAULT ('low'), "reason" text, "dueDate" datetime, "status" varchar(32) NOT NULL DEFAULT ('planned'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL, "deleted_at" datetime)`);
        await queryRunner.query(`INSERT INTO "temporary_followup_plans"("id", "title", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at") SELECT "id", "title", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at" FROM "followup_plans"`);
        await queryRunner.query(`DROP TABLE "followup_plans"`);
        await queryRunner.query(`ALTER TABLE "temporary_followup_plans" RENAME TO "followup_plans"`);
        await queryRunner.query(`CREATE INDEX "IDX_31abc4aef2940cd4b330480d21" ON "followup_plans" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "followup_plans" DROP COLUMN "customerId"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_31abc4aef2940cd4b330480d21"`);
        await queryRunner.query(`ALTER TABLE "followup_plans" RENAME TO "temporary_followup_plans"`);
        await queryRunner.query(`CREATE TABLE "followup_plans" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "priority" varchar(32) NOT NULL DEFAULT ('low'), "reason" text, "dueDate" datetime, "status" varchar(32) NOT NULL DEFAULT ('planned'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL, "deleted_at" datetime)`);
        await queryRunner.query(`INSERT INTO "followup_plans"("id", "title", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at") SELECT "id", "title", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at" FROM "temporary_followup_plans"`);
        await queryRunner.query(`DROP TABLE "temporary_followup_plans"`);
        await queryRunner.query(`CREATE INDEX "IDX_31abc4aef2940cd4b330480d21" ON "followup_plans" ("user_id") `);
    }

}

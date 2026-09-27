// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The `reports` sample module — the first generated module whose spec declares a `scope`, so it is the
 * live example of generated range columns (`org_id` + its index).
 *
 * Two things about this file are deliberate and were *not* taken straight from `migration:generate`:
 *
 *  - **Only this table.** Generating against the dev SQLite, whose schema has drifted, produced a
 *    migration that also rebuilt `ai_confirmation_requests` / `ai_tool_side_effects`, added
 *    `audit_chain_lock` and put foreign keys on `user_roles`. Those belong to other changes; sweeping
 *    them in here would make this migration silently responsible for schema nobody reviewed.
 *  - **Both dialects in one file.** `migration:generate` emits SQLite only. This migration is on the
 *    Postgres whitelist (`src/config/postgres-migrations.ts`), so it must carry a Postgres branch —
 *    otherwise `migrationsRun` on production dies on `AUTOINCREMENT` / `datetime('now')`.
 *
 * 时间戳取 `1831000000000`：晚于本仓现有最大（`1830000000000`）。`Date.now()` 生成的 `1790480942231`
 * **早于**建表迁移，全新库上会先建后删、或在 AddSuppliers 之前建表而后被覆盖 —— 见本仓迁移的五条坑。
 */
export class AddReports1831000000000 implements MigrationInterface {
  name = 'AddReports1831000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "reports" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "summary" text, "status" character varying(32) NOT NULL DEFAULT 'draft', "amount" integer, "user_id" integer, "org_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "version" integer NOT NULL, "deleted_at" TIMESTAMP, CONSTRAINT "PK_reports" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_cea2f786748fa6f2e329e91206" ON "reports" ("org_id") `);
      await queryRunner.query(`CREATE INDEX "IDX_ca7a21eb95ca4625bd5eaef7e0" ON "reports" ("user_id") `);
      return;
    }
    await queryRunner.query(`CREATE TABLE "reports" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "summary" text, "status" varchar(32) NOT NULL DEFAULT ('draft'), "amount" integer, "user_id" integer, "org_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL, "deleted_at" datetime)`);
    await queryRunner.query(`CREATE INDEX "IDX_cea2f786748fa6f2e329e91206" ON "reports" ("org_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_ca7a21eb95ca4625bd5eaef7e0" ON "reports" ("user_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ca7a21eb95ca4625bd5eaef7e0"`);
    await queryRunner.query(`DROP INDEX "IDX_cea2f786748fa6f2e329e91206"`);
    await queryRunner.query(`DROP TABLE "reports"`);
  }
}

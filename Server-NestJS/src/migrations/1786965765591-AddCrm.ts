// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI CRM 旗舰应用：crm_customers / crm_orders / crm_activities / crm_tasks / crm_risks 表。
 * 双驱动：postgres（SERIAL + 内联 FK）先建并 return；sqlite（AUTOINCREMENT + 临时表重建补 FK）。
 * 索引/FK 约束名取自 migration:generate 输出（TypeORM hash 名，避免一致性漂移）。
 */
export class AddCrm1786965765591 implements MigrationInterface {
  name = 'AddCrm1786965765591';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if ((queryRunner.connection.options as any).type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "crm_customers" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "email" character varying(120), "phone" character varying(32), "company" character varying(100), "status" character varying(32) NOT NULL DEFAULT 'lead', "riskLevel" character varying(16) NOT NULL DEFAULT 'low', "notes" text, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_61db60e1d4f435fa46e87751c7f" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_14cfad9be0dc031515e4e8db2f" ON "crm_customers"  ("status") `);
      await queryRunner.query(`CREATE INDEX "IDX_8bd7dbf46211db4e2b2aa921f8" ON "crm_customers"  ("user_id") `);
      await queryRunner.query(`CREATE TABLE "crm_activities" ("id" SERIAL NOT NULL, "customer_id" integer NOT NULL, "type" character varying(16) NOT NULL DEFAULT 'note', "summary" text NOT NULL, "happenedAt" TIMESTAMP NOT NULL, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d56ffe80fd59fb40765d9f6ff35" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_91b664207dfd83949af52a36dc" ON "crm_activities"  ("user_id") `);
      await queryRunner.query(`CREATE INDEX "IDX_bcb342281f56f08d236a69ee55" ON "crm_activities"  ("customer_id") `);
      await queryRunner.query(`CREATE TABLE "crm_orders" ("id" SERIAL NOT NULL, "customer_id" integer NOT NULL, "amount" double precision NOT NULL DEFAULT '0', "status" character varying(16) NOT NULL DEFAULT 'pending', "orderDate" TIMESTAMP, "dueDate" TIMESTAMP, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a0e680bd51f319b7602a9b99330" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_8f95692ca1b354fcfccf441f2f" ON "crm_orders"  ("user_id") `);
      await queryRunner.query(`CREATE INDEX "IDX_a038a058a9b77c9d073019cd64" ON "crm_orders"  ("customer_id") `);
      await queryRunner.query(`CREATE TABLE "crm_risks" ("id" SERIAL NOT NULL, "customer_id" integer NOT NULL, "level" character varying(16) NOT NULL DEFAULT 'medium', "reason" text NOT NULL, "detectedAt" TIMESTAMP NOT NULL, "resolvedAt" TIMESTAMP, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_af12158266e82cdf8b44320b9a4" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_8b570fccbd3b9b988aea026158" ON "crm_risks"  ("user_id") `);
      await queryRunner.query(`CREATE INDEX "IDX_4a416040c3f787ce76df4777cc" ON "crm_risks"  ("customer_id") `);
      await queryRunner.query(`CREATE TABLE "crm_tasks" ("id" SERIAL NOT NULL, "customer_id" integer, "title" character varying(200) NOT NULL, "description" text, "dueDate" TIMESTAMP, "status" character varying(16) NOT NULL DEFAULT 'pending', "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_0f6382dfa0313c9fac7ea0d18f3" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_abbfa5edbc0051a204fba73b02" ON "crm_tasks"  ("user_id") `);
      await queryRunner.query(`CREATE INDEX "IDX_d3757ca8d0d0d29fc6a7858af7" ON "crm_tasks"  ("customer_id") `);
      await queryRunner.query(`ALTER TABLE "crm_activities" ADD CONSTRAINT "FK_bcb342281f56f08d236a69ee557" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
      await queryRunner.query(`ALTER TABLE "crm_orders" ADD CONSTRAINT "FK_a038a058a9b77c9d073019cd646" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
      await queryRunner.query(`ALTER TABLE "crm_risks" ADD CONSTRAINT "FK_4a416040c3f787ce76df4777cca" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
      await queryRunner.query(`ALTER TABLE "crm_tasks" ADD CONSTRAINT "FK_d3757ca8d0d0d29fc6a7858af78" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
      return;
    }

    // ── sqlite ──
    await queryRunner.query(`CREATE TABLE "crm_customers" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(100) NOT NULL, "email" varchar(120), "phone" varchar(32), "company" varchar(100), "status" varchar(32) NOT NULL DEFAULT ('lead'), "riskLevel" varchar(16) NOT NULL DEFAULT ('low'), "notes" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`CREATE INDEX "IDX_14cfad9be0dc031515e4e8db2f" ON "crm_customers" ("status") `);
    await queryRunner.query(`CREATE INDEX "IDX_8bd7dbf46211db4e2b2aa921f8" ON "crm_customers" ("user_id") `);
    await queryRunner.query(`CREATE TABLE "crm_activities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "type" varchar(16) NOT NULL DEFAULT ('note'), "summary" text NOT NULL, "happenedAt" datetime NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_91b664207dfd83949af52a36dc" ON "crm_activities" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_bcb342281f56f08d236a69ee55" ON "crm_activities" ("customer_id") `);
    await queryRunner.query(`CREATE TABLE "crm_orders" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "amount" float NOT NULL DEFAULT (0), "status" varchar(16) NOT NULL DEFAULT ('pending'), "orderDate" datetime, "dueDate" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_8f95692ca1b354fcfccf441f2f" ON "crm_orders" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_a038a058a9b77c9d073019cd64" ON "crm_orders" ("customer_id") `);
    await queryRunner.query(`CREATE TABLE "crm_risks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "level" varchar(16) NOT NULL DEFAULT ('medium'), "reason" text NOT NULL, "detectedAt" datetime NOT NULL, "resolvedAt" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_8b570fccbd3b9b988aea026158" ON "crm_risks" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_4a416040c3f787ce76df4777cc" ON "crm_risks" ("customer_id") `);
    await queryRunner.query(`CREATE TABLE "crm_tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer, "title" varchar(200) NOT NULL, "description" text, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`CREATE INDEX "IDX_abbfa5edbc0051a204fba73b02" ON "crm_tasks" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_d3757ca8d0d0d29fc6a7858af7" ON "crm_tasks" ("customer_id") `);
    // sqlite 无 ALTER ADD CONSTRAINT，经临时表重建补 FK（TypeORM 生成器标准做法）
    await queryRunner.query(`DROP INDEX "IDX_91b664207dfd83949af52a36dc"`);
    await queryRunner.query(`DROP INDEX "IDX_bcb342281f56f08d236a69ee55"`);
    await queryRunner.query(`CREATE TABLE "temporary_crm_activities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "type" varchar(16) NOT NULL DEFAULT ('note'), "summary" text NOT NULL, "happenedAt" datetime NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_bcb342281f56f08d236a69ee557" FOREIGN KEY ("customer_id") REFERENCES "crm_customers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(`INSERT INTO "temporary_crm_activities"("id", "customer_id", "type", "summary", "happenedAt", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "type", "summary", "happenedAt", "user_id", "createdAt", "updatedAt" FROM "crm_activities"`);
    await queryRunner.query(`DROP TABLE "crm_activities"`);
    await queryRunner.query(`ALTER TABLE "temporary_crm_activities" RENAME TO "crm_activities"`);
    await queryRunner.query(`CREATE INDEX "IDX_91b664207dfd83949af52a36dc" ON "crm_activities" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_bcb342281f56f08d236a69ee55" ON "crm_activities" ("customer_id") `);
    await queryRunner.query(`DROP INDEX "IDX_8f95692ca1b354fcfccf441f2f"`);
    await queryRunner.query(`DROP INDEX "IDX_a038a058a9b77c9d073019cd64"`);
    await queryRunner.query(`CREATE TABLE "temporary_crm_orders" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "amount" float NOT NULL DEFAULT (0), "status" varchar(16) NOT NULL DEFAULT ('pending'), "orderDate" datetime, "dueDate" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_a038a058a9b77c9d073019cd646" FOREIGN KEY ("customer_id") REFERENCES "crm_customers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(`INSERT INTO "temporary_crm_orders"("id", "customer_id", "amount", "status", "orderDate", "dueDate", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "amount", "status", "orderDate", "dueDate", "user_id", "createdAt", "updatedAt" FROM "crm_orders"`);
    await queryRunner.query(`DROP TABLE "crm_orders"`);
    await queryRunner.query(`ALTER TABLE "temporary_crm_orders" RENAME TO "crm_orders"`);
    await queryRunner.query(`CREATE INDEX "IDX_8f95692ca1b354fcfccf441f2f" ON "crm_orders" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_a038a058a9b77c9d073019cd64" ON "crm_orders" ("customer_id") `);
    await queryRunner.query(`DROP INDEX "IDX_8b570fccbd3b9b988aea026158"`);
    await queryRunner.query(`DROP INDEX "IDX_4a416040c3f787ce76df4777cc"`);
    await queryRunner.query(`CREATE TABLE "temporary_crm_risks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "level" varchar(16) NOT NULL DEFAULT ('medium'), "reason" text NOT NULL, "detectedAt" datetime NOT NULL, "resolvedAt" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4a416040c3f787ce76df4777cca" FOREIGN KEY ("customer_id") REFERENCES "crm_customers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(`INSERT INTO "temporary_crm_risks"("id", "customer_id", "level", "reason", "detectedAt", "resolvedAt", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "level", "reason", "detectedAt", "resolvedAt", "user_id", "createdAt", "updatedAt" FROM "crm_risks"`);
    await queryRunner.query(`DROP TABLE "crm_risks"`);
    await queryRunner.query(`ALTER TABLE "temporary_crm_risks" RENAME TO "crm_risks"`);
    await queryRunner.query(`CREATE INDEX "IDX_8b570fccbd3b9b988aea026158" ON "crm_risks" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_4a416040c3f787ce76df4777cc" ON "crm_risks" ("customer_id") `);
    await queryRunner.query(`DROP INDEX "IDX_abbfa5edbc0051a204fba73b02"`);
    await queryRunner.query(`DROP INDEX "IDX_d3757ca8d0d0d29fc6a7858af7"`);
    await queryRunner.query(`CREATE TABLE "temporary_crm_tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer, "title" varchar(200) NOT NULL, "description" text, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, CONSTRAINT "FK_d3757ca8d0d0d29fc6a7858af78" FOREIGN KEY ("customer_id") REFERENCES "crm_customers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
    await queryRunner.query(`INSERT INTO "temporary_crm_tasks"("id", "customer_id", "title", "description", "dueDate", "status", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "customer_id", "title", "description", "dueDate", "status", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "crm_tasks"`);
    await queryRunner.query(`DROP TABLE "crm_tasks"`);
    await queryRunner.query(`ALTER TABLE "temporary_crm_tasks" RENAME TO "crm_tasks"`);
    await queryRunner.query(`CREATE INDEX "IDX_abbfa5edbc0051a204fba73b02" ON "crm_tasks" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_d3757ca8d0d0d29fc6a7858af7" ON "crm_tasks" ("customer_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if ((queryRunner.connection.options as any).type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "crm_tasks" DROP CONSTRAINT "FK_d3757ca8d0d0d29fc6a7858af78"`);
      await queryRunner.query(`ALTER TABLE "crm_risks" DROP CONSTRAINT "FK_4a416040c3f787ce76df4777cca"`);
      await queryRunner.query(`ALTER TABLE "crm_orders" DROP CONSTRAINT "FK_a038a058a9b77c9d073019cd646"`);
      await queryRunner.query(`ALTER TABLE "crm_activities" DROP CONSTRAINT "FK_bcb342281f56f08d236a69ee557"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_d3757ca8d0d0d29fc6a7858af7"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_abbfa5edbc0051a204fba73b02"`);
      await queryRunner.query(`DROP TABLE "crm_tasks"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_4a416040c3f787ce76df4777cc"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_8b570fccbd3b9b988aea026158"`);
      await queryRunner.query(`DROP TABLE "crm_risks"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_a038a058a9b77c9d073019cd64"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_8f95692ca1b354fcfccf441f2f"`);
      await queryRunner.query(`DROP TABLE "crm_orders"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_bcb342281f56f08d236a69ee55"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_91b664207dfd83949af52a36dc"`);
      await queryRunner.query(`DROP TABLE "crm_activities"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_8bd7dbf46211db4e2b2aa921f8"`);
      await queryRunner.query(`DROP INDEX "public"."IDX_14cfad9be0dc031515e4e8db2f"`);
      await queryRunner.query(`DROP TABLE "crm_customers"`);
      return;
    }
    await queryRunner.query(`DROP INDEX "IDX_d3757ca8d0d0d29fc6a7858af7"`);
    await queryRunner.query(`DROP INDEX "IDX_abbfa5edbc0051a204fba73b02"`);
    await queryRunner.query(`ALTER TABLE "crm_tasks" RENAME TO "temporary_crm_tasks"`);
    await queryRunner.query(`CREATE TABLE "crm_tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer, "title" varchar(200) NOT NULL, "description" text, "dueDate" datetime, "status" varchar(16) NOT NULL DEFAULT ('pending'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "crm_tasks"("id", "customer_id", "title", "description", "dueDate", "status", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "customer_id", "title", "description", "dueDate", "status", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_crm_tasks"`);
    await queryRunner.query(`DROP TABLE "temporary_crm_tasks"`);
    await queryRunner.query(`CREATE INDEX "IDX_d3757ca8d0d0d29fc6a7858af7" ON "crm_tasks" ("customer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_abbfa5edbc0051a204fba73b02" ON "crm_tasks" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_4a416040c3f787ce76df4777cc"`);
    await queryRunner.query(`DROP INDEX "IDX_8b570fccbd3b9b988aea026158"`);
    await queryRunner.query(`ALTER TABLE "crm_risks" RENAME TO "temporary_crm_risks"`);
    await queryRunner.query(`CREATE TABLE "crm_risks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "level" varchar(16) NOT NULL DEFAULT ('medium'), "reason" text NOT NULL, "detectedAt" datetime NOT NULL, "resolvedAt" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`INSERT INTO "crm_risks"("id", "customer_id", "level", "reason", "detectedAt", "resolvedAt", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "level", "reason", "detectedAt", "resolvedAt", "user_id", "createdAt", "updatedAt" FROM "temporary_crm_risks"`);
    await queryRunner.query(`DROP TABLE "temporary_crm_risks"`);
    await queryRunner.query(`CREATE INDEX "IDX_4a416040c3f787ce76df4777cc" ON "crm_risks" ("customer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_8b570fccbd3b9b988aea026158" ON "crm_risks" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_a038a058a9b77c9d073019cd64"`);
    await queryRunner.query(`DROP INDEX "IDX_8f95692ca1b354fcfccf441f2f"`);
    await queryRunner.query(`ALTER TABLE "crm_orders" RENAME TO "temporary_crm_orders"`);
    await queryRunner.query(`CREATE TABLE "crm_orders" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "amount" float NOT NULL DEFAULT (0), "status" varchar(16) NOT NULL DEFAULT ('pending'), "orderDate" datetime, "dueDate" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`INSERT INTO "crm_orders"("id", "customer_id", "amount", "status", "orderDate", "dueDate", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "amount", "status", "orderDate", "dueDate", "user_id", "createdAt", "updatedAt" FROM "temporary_crm_orders"`);
    await queryRunner.query(`DROP TABLE "temporary_crm_orders"`);
    await queryRunner.query(`CREATE INDEX "IDX_a038a058a9b77c9d073019cd64" ON "crm_orders" ("customer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_8f95692ca1b354fcfccf441f2f" ON "crm_orders" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_bcb342281f56f08d236a69ee55"`);
    await queryRunner.query(`DROP INDEX "IDX_91b664207dfd83949af52a36dc"`);
    await queryRunner.query(`ALTER TABLE "crm_activities" RENAME TO "temporary_crm_activities"`);
    await queryRunner.query(`CREATE TABLE "crm_activities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "customer_id" integer NOT NULL, "type" varchar(16) NOT NULL DEFAULT ('note'), "summary" text NOT NULL, "happenedAt" datetime NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`INSERT INTO "crm_activities"("id", "customer_id", "type", "summary", "happenedAt", "user_id", "createdAt", "updatedAt") SELECT "id", "customer_id", "type", "summary", "happenedAt", "user_id", "createdAt", "updatedAt" FROM "temporary_crm_activities"`);
    await queryRunner.query(`DROP TABLE "temporary_crm_activities"`);
    await queryRunner.query(`CREATE INDEX "IDX_bcb342281f56f08d236a69ee55" ON "crm_activities" ("customer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_91b664207dfd83949af52a36dc" ON "crm_activities" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_8bd7dbf46211db4e2b2aa921f8"`);
    await queryRunner.query(`DROP INDEX "IDX_14cfad9be0dc031515e4e8db2f"`);
    await queryRunner.query(`DROP TABLE "crm_customers"`);
  }
}

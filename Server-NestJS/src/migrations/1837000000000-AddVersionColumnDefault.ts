// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The optimistic-lock `version` column gains a default, and the six sample modules finally get the column.
 *
 * Why this migration exists: `@VersionColumn()` declares `int NOT NULL` **with no default**, and a NOT NULL
 * column without a default cannot be added to a table that already has rows — sqlite refuses the backfill on
 * the constraint, Postgres does too. The six sample modules (books / contracts / notes / posts / suppliers /
 * tags) had the column added to their entities without a migration, so migrations-built databases never got
 * it at all, while synchronize-built (dev) databases could not take it. Both are fixed here: the column is
 * created with `DEFAULT 1`, which is the value TypeORM already starts a version column at.
 *
 * The same pass also tightens `notes.content` to the shape its entity declares (non-null varchar(200)); the
 * table had been created as `text` nullable. Existing NULLs are backfilled to `''` first, so the NOT NULL can
 * be set on a table that already has rows.
 *
 * 乐观锁的 `version` 列加默认值，六个示例模块终于拿到这一列。
 *
 * 本迁移为何存在：`@VersionColumn()` 声明的是 `int NOT NULL` **无默认值**，而「NOT NULL 且无默认」的列
 * 加不到**已有数据**的表上——sqlite 因约束拒绝回填，Postgres 同样。六个示例模块（books / contracts /
 * notes / posts / suppliers / tags）的实体加了这一列却没有对应迁移，于是由迁移建出的库压根没有它，而由
 * synchronize 建出的开发库又加不上。此处一并修好：建列时带 `DEFAULT 1`，而 1 正是 TypeORM 为版本列取的
 * 起始值。
 *
 * 同一趟还把 `notes.content` 收紧到其实体声明的形状（非空 varchar(200)）——该表当初是按可空 `text` 建的；
 * 先把既有 NULL 回填成 `''`，这样 NOT NULL 才设得上已有数据的表。
 */
export class AddVersionColumnDefault1837000000000 implements MigrationInterface {
  name = 'AddVersionColumnDefault1837000000000';

  /** 已带 version 列的两个模块：只补默认值，不重复建列。 */
  private readonly withColumn = ['followup_plans', 'reports'];
  /** 缺 version 列的六个示例模块：建列并回填。 */
  private readonly withoutColumn = ['books', 'contracts', 'notes', 'posts', 'suppliers', 'tags'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      for (const table of this.withoutColumn) {
        await queryRunner.query(`ALTER TABLE "${table}" ADD "version" integer NOT NULL DEFAULT 1`);
      }
      for (const table of this.withColumn) {
        await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "version" SET DEFAULT 1`);
      }
      // NOT NULL 设在已有数据的表上之前，先把既有 NULL 回填（否则整条迁移失败）
      await queryRunner.query(`UPDATE "notes" SET "content" = '' WHERE "content" IS NULL`);
      await queryRunner.query(`ALTER TABLE "notes" ALTER COLUMN "content" TYPE character varying(200)`);
      await queryRunner.query(`ALTER TABLE "notes" ALTER COLUMN "content" SET NOT NULL`);
      return;
    }

    await queryRunner.query(`DROP INDEX "IDX_d2211ba79c9312cdcda4d7d586"`);
    await queryRunner.query(`CREATE TABLE "temporary_books" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "author" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "status" varchar(32) NOT NULL DEFAULT ('unread'), "rating" integer, "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "temporary_books"("id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at", "status", "rating") SELECT "id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at", "status", "rating" FROM "books"`);
    await queryRunner.query(`DROP TABLE "books"`);
    await queryRunner.query(`ALTER TABLE "temporary_books" RENAME TO "books"`);
    await queryRunner.query(`CREATE INDEX "IDX_d2211ba79c9312cdcda4d7d586" ON "books" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_4e1de36dfe48eb55999a95e105"`);
    await queryRunner.query(`CREATE TABLE "temporary_contracts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "counterparty" varchar(200) NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('draft'), "amount" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "temporary_contracts"("id", "name", "counterparty", "status", "amount", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "name", "counterparty", "status", "amount", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "contracts"`);
    await queryRunner.query(`DROP TABLE "contracts"`);
    await queryRunner.query(`ALTER TABLE "temporary_contracts" RENAME TO "contracts"`);
    await queryRunner.query(`CREATE INDEX "IDX_4e1de36dfe48eb55999a95e105" ON "contracts" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_7708dcb62ff332f0eaf9f0743a"`);
    await queryRunner.query(`CREATE TABLE "temporary_notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "category" varchar(32) NOT NULL DEFAULT ('work'), "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "temporary_notes"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at", "category") SELECT "id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at", "category" FROM "notes"`);
    await queryRunner.query(`DROP TABLE "notes"`);
    await queryRunner.query(`ALTER TABLE "temporary_notes" RENAME TO "notes"`);
    await queryRunner.query(`CREATE INDEX "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_c4f9a7bd77b489e711277ee598"`);
    await queryRunner.query(`CREATE TABLE "temporary_posts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "temporary_posts"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "posts"`);
    await queryRunner.query(`DROP TABLE "posts"`);
    await queryRunner.query(`ALTER TABLE "temporary_posts" RENAME TO "posts"`);
    await queryRunner.query(`CREATE INDEX "IDX_c4f9a7bd77b489e711277ee598" ON "posts" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_b3aba33228acd59f2d734c31b8"`);
    await queryRunner.query(`CREATE TABLE "temporary_suppliers" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "contact" varchar(200) NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('active'), "riskLevel" varchar(32) NOT NULL DEFAULT ('low'), "annualSpend" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "temporary_suppliers"("id", "name", "contact", "status", "riskLevel", "annualSpend", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "name", "contact", "status", "riskLevel", "annualSpend", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "suppliers"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(`ALTER TABLE "temporary_suppliers" RENAME TO "suppliers"`);
    await queryRunner.query(`CREATE INDEX "IDX_b3aba33228acd59f2d734c31b8" ON "suppliers" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_74603743868d1e4f4fc2c0225b"`);
    await queryRunner.query(`CREATE TABLE "temporary_tags" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "temporary_tags"("id", "name", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "name", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "tags"`);
    await queryRunner.query(`DROP TABLE "tags"`);
    await queryRunner.query(`ALTER TABLE "temporary_tags" RENAME TO "tags"`);
    await queryRunner.query(`CREATE INDEX "IDX_74603743868d1e4f4fc2c0225b" ON "tags" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_31abc4aef2940cd4b330480d21"`);
    await queryRunner.query(`CREATE TABLE "temporary_followup_plans" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "customerId" integer, "priority" varchar(32) NOT NULL DEFAULT ('low'), "reason" text, "dueDate" datetime, "status" varchar(32) NOT NULL DEFAULT ('planned'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "temporary_followup_plans"("id", "title", "customerId", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at") SELECT "id", "title", "customerId", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at" FROM "followup_plans"`);
    await queryRunner.query(`DROP TABLE "followup_plans"`);
    await queryRunner.query(`ALTER TABLE "temporary_followup_plans" RENAME TO "followup_plans"`);
    await queryRunner.query(`CREATE INDEX "IDX_31abc4aef2940cd4b330480d21" ON "followup_plans" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_7708dcb62ff332f0eaf9f0743a"`);
    // `COALESCE` 而非裸 SELECT：目标列是 NOT NULL，而源列可空 —— 不这样写，任何 content 为 NULL 的既有行
    // 都会让整条迁移失败。（生成产物原文是裸 SELECT。）
    await queryRunner.query(`CREATE TABLE "temporary_notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "category" varchar(32) NOT NULL DEFAULT ('work'), "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "temporary_notes"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at", "category", "version") SELECT "id", "title", COALESCE("content", ''), "user_id", "createdAt", "updatedAt", "deleted_at", "category", "version" FROM "notes"`);
    await queryRunner.query(`DROP TABLE "notes"`);
    await queryRunner.query(`ALTER TABLE "temporary_notes" RENAME TO "notes"`);
    await queryRunner.query(`CREATE INDEX "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_ca7a21eb95ca4625bd5eaef7e0"`);
    await queryRunner.query(`DROP INDEX "IDX_cea2f786748fa6f2e329e91206"`);
    await queryRunner.query(`CREATE TABLE "temporary_reports" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "summary" text, "status" varchar(32) NOT NULL DEFAULT ('draft'), "amount" integer, "user_id" integer, "org_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "temporary_reports"("id", "title", "summary", "status", "amount", "user_id", "org_id", "createdAt", "updatedAt", "version", "deleted_at") SELECT "id", "title", "summary", "status", "amount", "user_id", "org_id", "createdAt", "updatedAt", "version", "deleted_at" FROM "reports"`);
    await queryRunner.query(`DROP TABLE "reports"`);
    await queryRunner.query(`ALTER TABLE "temporary_reports" RENAME TO "reports"`);
    await queryRunner.query(`CREATE INDEX "IDX_ca7a21eb95ca4625bd5eaef7e0" ON "reports" ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_cea2f786748fa6f2e329e91206" ON "reports" ("org_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "notes" ALTER COLUMN "content" DROP NOT NULL`);
      await queryRunner.query(`ALTER TABLE "notes" ALTER COLUMN "content" TYPE text`);
      for (const table of this.withColumn) {
        await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "version" DROP DEFAULT`);
      }
      for (const table of this.withoutColumn) {
        await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "version"`);
      }
      return;
    }

    await queryRunner.query(`DROP INDEX "IDX_cea2f786748fa6f2e329e91206"`);
    await queryRunner.query(`DROP INDEX "IDX_ca7a21eb95ca4625bd5eaef7e0"`);
    await queryRunner.query(`ALTER TABLE "reports" RENAME TO "temporary_reports"`);
    await queryRunner.query(`CREATE TABLE "reports" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "summary" text, "status" varchar(32) NOT NULL DEFAULT ('draft'), "amount" integer, "user_id" integer, "org_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL, "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "reports"("id", "title", "summary", "status", "amount", "user_id", "org_id", "createdAt", "updatedAt", "version", "deleted_at") SELECT "id", "title", "summary", "status", "amount", "user_id", "org_id", "createdAt", "updatedAt", "version", "deleted_at" FROM "temporary_reports"`);
    await queryRunner.query(`DROP TABLE "temporary_reports"`);
    await queryRunner.query(`CREATE INDEX "IDX_cea2f786748fa6f2e329e91206" ON "reports" ("org_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_ca7a21eb95ca4625bd5eaef7e0" ON "reports" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_7708dcb62ff332f0eaf9f0743a"`);
    await queryRunner.query(`ALTER TABLE "notes" RENAME TO "temporary_notes"`);
    await queryRunner.query(`CREATE TABLE "notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "category" varchar(32) NOT NULL DEFAULT ('work'), "version" integer NOT NULL DEFAULT (1))`);
    await queryRunner.query(`INSERT INTO "notes"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at", "category", "version") SELECT "id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at", "category", "version" FROM "temporary_notes"`);
    await queryRunner.query(`DROP TABLE "temporary_notes"`);
    await queryRunner.query(`CREATE INDEX "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_31abc4aef2940cd4b330480d21"`);
    await queryRunner.query(`ALTER TABLE "followup_plans" RENAME TO "temporary_followup_plans"`);
    await queryRunner.query(`CREATE TABLE "followup_plans" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "customerId" integer, "priority" varchar(32) NOT NULL DEFAULT ('low'), "reason" text, "dueDate" datetime, "status" varchar(32) NOT NULL DEFAULT ('planned'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL, "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "followup_plans"("id", "title", "customerId", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at") SELECT "id", "title", "customerId", "priority", "reason", "dueDate", "status", "user_id", "createdAt", "updatedAt", "version", "deleted_at" FROM "temporary_followup_plans"`);
    await queryRunner.query(`DROP TABLE "temporary_followup_plans"`);
    await queryRunner.query(`CREATE INDEX "IDX_31abc4aef2940cd4b330480d21" ON "followup_plans" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_74603743868d1e4f4fc2c0225b"`);
    await queryRunner.query(`ALTER TABLE "tags" RENAME TO "temporary_tags"`);
    await queryRunner.query(`CREATE TABLE "tags" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "tags"("id", "name", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "name", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_tags"`);
    await queryRunner.query(`DROP TABLE "temporary_tags"`);
    await queryRunner.query(`CREATE INDEX "IDX_74603743868d1e4f4fc2c0225b" ON "tags" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_b3aba33228acd59f2d734c31b8"`);
    await queryRunner.query(`ALTER TABLE "suppliers" RENAME TO "temporary_suppliers"`);
    await queryRunner.query(`CREATE TABLE "suppliers" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "contact" varchar(200) NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('active'), "riskLevel" varchar(32) NOT NULL DEFAULT ('low'), "annualSpend" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "suppliers"("id", "name", "contact", "status", "riskLevel", "annualSpend", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "name", "contact", "status", "riskLevel", "annualSpend", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_suppliers"`);
    await queryRunner.query(`DROP TABLE "temporary_suppliers"`);
    await queryRunner.query(`CREATE INDEX "IDX_b3aba33228acd59f2d734c31b8" ON "suppliers" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_c4f9a7bd77b489e711277ee598"`);
    await queryRunner.query(`ALTER TABLE "posts" RENAME TO "temporary_posts"`);
    await queryRunner.query(`CREATE TABLE "posts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "posts"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_posts"`);
    await queryRunner.query(`DROP TABLE "temporary_posts"`);
    await queryRunner.query(`CREATE INDEX "IDX_c4f9a7bd77b489e711277ee598" ON "posts" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_7708dcb62ff332f0eaf9f0743a"`);
    await queryRunner.query(`ALTER TABLE "notes" RENAME TO "temporary_notes"`);
    await queryRunner.query(`CREATE TABLE "notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "category" varchar(32) NOT NULL DEFAULT ('work'))`);
    await queryRunner.query(`INSERT INTO "notes"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at", "category") SELECT "id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at", "category" FROM "temporary_notes"`);
    await queryRunner.query(`DROP TABLE "temporary_notes"`);
    await queryRunner.query(`CREATE INDEX "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_4e1de36dfe48eb55999a95e105"`);
    await queryRunner.query(`ALTER TABLE "contracts" RENAME TO "temporary_contracts"`);
    await queryRunner.query(`CREATE TABLE "contracts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "counterparty" varchar(200) NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('draft'), "amount" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "contracts"("id", "name", "counterparty", "status", "amount", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "name", "counterparty", "status", "amount", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_contracts"`);
    await queryRunner.query(`DROP TABLE "temporary_contracts"`);
    await queryRunner.query(`CREATE INDEX "IDX_4e1de36dfe48eb55999a95e105" ON "contracts" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_d2211ba79c9312cdcda4d7d586"`);
    await queryRunner.query(`ALTER TABLE "books" RENAME TO "temporary_books"`);
    await queryRunner.query(`CREATE TABLE "books" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "author" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "status" varchar(32) NOT NULL DEFAULT ('unread'), "rating" integer)`);
    await queryRunner.query(`INSERT INTO "books"("id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at", "status", "rating") SELECT "id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at", "status", "rating" FROM "temporary_books"`);
    await queryRunner.query(`DROP TABLE "temporary_books"`);
    await queryRunner.query(`CREATE INDEX "IDX_d2211ba79c9312cdcda4d7d586" ON "books" ("user_id") `);
  }
}

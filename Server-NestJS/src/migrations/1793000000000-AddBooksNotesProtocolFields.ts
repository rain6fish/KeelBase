// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 协议↔实体一致性（2026-08-20）：specs/books.json、specs/notes.json 声明 status/rating/category，
 * 既有 books/notes 生成模块缺这些字段 → 按 spec 回填。
 * 时间戳排在 AddGeneratedModuleSchemas（建 books 表）与 PostgresIncrementalSchema（postgres 建 notes 表）之后，
 * 保证两驱动下 ALTER 时表已存在。postgres 分支幂等（D.11 风格），sqlite 分支为 generate 重建模式。
 */
export class AddBooksNotesProtocolFields1793000000000 implements MigrationInterface {
  name = 'AddBooksNotesProtocolFields1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "status" character varying(32) NOT NULL DEFAULT 'unread'`);
      await queryRunner.query(`ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "rating" integer`);
      await queryRunner.query(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "category" character varying(32) NOT NULL DEFAULT 'work'`);
      return;
    }

    await queryRunner.query(`DROP INDEX "IDX_d2211ba79c9312cdcda4d7d586"`);
    await queryRunner.query(`CREATE TABLE "temporary_books" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "author" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "status" varchar(32) NOT NULL DEFAULT ('unread'), "rating" integer)`);
    await queryRunner.query(`INSERT INTO "temporary_books"("id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "books"`);
    await queryRunner.query(`DROP TABLE "books"`);
    await queryRunner.query(`ALTER TABLE "temporary_books" RENAME TO "books"`);
    await queryRunner.query(`CREATE INDEX "IDX_d2211ba79c9312cdcda4d7d586" ON "books" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_7708dcb62ff332f0eaf9f0743a"`);
    await queryRunner.query(`CREATE TABLE "temporary_notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime, "category" varchar(32) NOT NULL DEFAULT ('work'))`);
    await queryRunner.query(`INSERT INTO "temporary_notes"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "notes"`);
    await queryRunner.query(`DROP TABLE "notes"`);
    await queryRunner.query(`ALTER TABLE "temporary_notes" RENAME TO "notes"`);
    await queryRunner.query(`CREATE INDEX "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "notes" DROP COLUMN IF EXISTS "category"`);
      await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "rating"`);
      await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "status"`);
      return;
    }

    await queryRunner.query(`DROP INDEX "IDX_7708dcb62ff332f0eaf9f0743a"`);
    await queryRunner.query(`ALTER TABLE "notes" RENAME TO "temporary_notes"`);
    await queryRunner.query(`CREATE TABLE "notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "notes"("id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "title", "content", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_notes"`);
    await queryRunner.query(`DROP TABLE "temporary_notes"`);
    await queryRunner.query(`CREATE INDEX "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id") `);
    await queryRunner.query(`DROP INDEX "IDX_d2211ba79c9312cdcda4d7d586"`);
    await queryRunner.query(`ALTER TABLE "books" RENAME TO "temporary_books"`);
    await queryRunner.query(`CREATE TABLE "books" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "author" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
    await queryRunner.query(`INSERT INTO "books"("id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at") SELECT "id", "title", "author", "user_id", "createdAt", "updatedAt", "deleted_at" FROM "temporary_books"`);
    await queryRunner.query(`DROP TABLE "temporary_books"`);
    await queryRunner.query(`CREATE INDEX "IDX_d2211ba79c9312cdcda4d7d586" ON "books" ("user_id") `);
  }
}

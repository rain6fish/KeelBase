import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 迁移一致性治理（2026-08-14，修 CI 一致性 glob 后暴露的既有 gap + EASY-2 生成模块建表）：
 * 1) form_schemas/form_submissions：AddFormBuilder 用手写索引名，与 TypeORM 实体元数据（hash 名 + slug 唯一约束）不一致 → 重建对齐
 * 2) posts/books：keelbase init（EASY-2）生成模块的建表迁移（索引名取 migration:generate 输出的 hash，双方言）
 */
export class AddGeneratedModuleSchemas1788100000000 implements MigrationInterface {
  name = 'AddGeneratedModuleSchemas1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`DROP INDEX "IDX_form_schemas_slug"`);
      await queryRunner.query(`DROP INDEX "IDX_form_submissions_schema"`);
      await queryRunner.query(
        `ALTER TABLE "form_schemas" ADD CONSTRAINT "UQ_16bfa3a0721f289f8a490ac5b1f" UNIQUE ("slug")`,
      );
      await queryRunner.query(`CREATE INDEX "IDX_30e3486bcc4044e8fcaf4e7931" ON "form_schemas" ("slug") `);
      await queryRunner.query(`CREATE INDEX "IDX_70faea022154bc6a6b2fc6a0c5" ON "form_submissions" ("schema_id") `);
      await queryRunner.query(`CREATE INDEX "IDX_e640f81eb076cc88ca6bf28820" ON "form_submissions" ("user_id") `);
      await queryRunner.query(
        `CREATE TABLE "posts" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "content" text, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_posts" PRIMARY KEY ("id"))`,
      );
      await queryRunner.query(`CREATE INDEX "IDX_c4f9a7bd77b489e711277ee598" ON "posts" ("user_id") `);
      await queryRunner.query(
        `CREATE TABLE "books" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "author" character varying(200) NOT NULL, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_books" PRIMARY KEY ("id"))`,
      );
      await queryRunner.query(`CREATE INDEX "IDX_d2211ba79c9312cdcda4d7d586" ON "books" ("user_id") `);
      return;
    }

    // sqlite：重建 form_schemas 以带 slug 唯一约束；drop 手写索引；建 posts/books
    await queryRunner.query(`DROP INDEX "IDX_form_schemas_slug"`);
    await queryRunner.query(`DROP INDEX "IDX_form_submissions_schema"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_form_schemas" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(100) NOT NULL, "slug" varchar(64) NOT NULL, "schemaJson" text NOT NULL, "description" varchar(255), "enabled" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_16bfa3a0721f289f8a490ac5b1f" UNIQUE ("slug"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form_schemas"("id", "title", "slug", "schemaJson", "description", "enabled", "createdAt", "updatedAt") SELECT "id", "title", "slug", "schemaJson", "description", "enabled", "createdAt", "updatedAt" FROM "form_schemas"`,
    );
    await queryRunner.query(`DROP TABLE "form_schemas"`);
    await queryRunner.query(`ALTER TABLE "temporary_form_schemas" RENAME TO "form_schemas"`);
    await queryRunner.query(`CREATE INDEX "IDX_30e3486bcc4044e8fcaf4e7931" ON "form_schemas" ("slug") `);
    await queryRunner.query(`CREATE INDEX "IDX_70faea022154bc6a6b2fc6a0c5" ON "form_submissions" ("schema_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_e640f81eb076cc88ca6bf28820" ON "form_submissions" ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "posts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_c4f9a7bd77b489e711277ee598" ON "posts" ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "books" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "author" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_d2211ba79c9312cdcda4d7d586" ON "books" ("user_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_d2211ba79c9312cdcda4d7d586"`);
    await queryRunner.query(`DROP TABLE "books"`);
    await queryRunner.query(`DROP INDEX "IDX_c4f9a7bd77b489e711277ee598"`);
    await queryRunner.query(`DROP TABLE "posts"`);
    await queryRunner.query(`DROP INDEX "IDX_e640f81eb076cc88ca6bf28820"`);
    await queryRunner.query(`DROP INDEX "IDX_70faea022154bc6a6b2fc6a0c5"`);
    await queryRunner.query(`DROP INDEX "IDX_30e3486bcc4044e8fcaf4e7931"`);
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "form_schemas" DROP CONSTRAINT "UQ_16bfa3a0721f289f8a490ac5b1f"`);
      return;
    }
    await queryRunner.query(
      `CREATE TABLE "temporary_form_schemas" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(100) NOT NULL, "slug" varchar(64) NOT NULL, "schemaJson" text NOT NULL, "description" varchar(255), "enabled" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form_schemas"("id", "title", "slug", "schemaJson", "description", "enabled", "createdAt", "updatedAt") SELECT "id", "title", "slug", "schemaJson", "description", "enabled", "createdAt", "updatedAt" FROM "form_schemas"`,
    );
    await queryRunner.query(`DROP TABLE "form_schemas"`);
    await queryRunner.query(`ALTER TABLE "temporary_form_schemas" RENAME TO "form_schemas"`);
    await queryRunner.query(`CREATE INDEX "IDX_form_submissions_schema" ON "form_submissions" ("schema_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_form_schemas_slug" ON "form_schemas" ("slug") `);
  }
}

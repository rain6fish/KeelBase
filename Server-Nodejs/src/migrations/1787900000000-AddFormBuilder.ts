import { MigrationInterface, QueryRunner } from 'typeorm';

/** PL-10 低代码表单：form_schemas + form_submissions 表（sqlite + postgres 双驱动）。 */
export class AddFormBuilder1787900000000 implements MigrationInterface {
  name = 'AddFormBuilder1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "form_schemas" ("id" SERIAL NOT NULL, "title" character varying(100) NOT NULL, "slug" character varying(64) NOT NULL, "schemaJson" text NOT NULL, "description" character varying(255), "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_form_schemas" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE UNIQUE INDEX "IDX_form_schemas_slug" ON "form_schemas" ("slug") `);
      await queryRunner.query(`CREATE TABLE "form_submissions" ("id" SERIAL NOT NULL, "schema_id" integer NOT NULL, "user_id" integer NOT NULL, "data" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_form_submissions" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE INDEX "IDX_form_submissions_schema" ON "form_submissions" ("schema_id") `);
      return;
    }
    await queryRunner.query(`CREATE TABLE "form_schemas" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(100) NOT NULL, "slug" varchar(64) NOT NULL, "schemaJson" text NOT NULL, "description" varchar(255), "enabled" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_form_schemas_slug" ON "form_schemas" ("slug") `);
    await queryRunner.query(`CREATE TABLE "form_submissions" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "schema_id" integer NOT NULL, "user_id" integer NOT NULL, "data" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_form_submissions_schema" ON "form_submissions" ("schema_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`DROP INDEX "IDX_form_submissions_schema"`);
      await queryRunner.query(`DROP TABLE "form_submissions"`);
      await queryRunner.query(`DROP INDEX "IDX_form_schemas_slug"`);
      await queryRunner.query(`DROP TABLE "form_schemas"`);
      return;
    }
    await queryRunner.query(`DROP INDEX "IDX_form_submissions_schema"`);
    await queryRunner.query(`DROP TABLE "form_submissions"`);
    await queryRunner.query(`DROP INDEX "IDX_form_schemas_slug"`);
    await queryRunner.query(`DROP TABLE "form_schemas"`);
  }
}

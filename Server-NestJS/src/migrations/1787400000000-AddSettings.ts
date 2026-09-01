// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/** RG-2 动态配置中心：settings 表（sqlite + postgres 双驱动，postgres 也需加载）。 */
export class AddSettings1787400000000 implements MigrationInterface {
  name = 'AddSettings1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "settings" ("id" SERIAL NOT NULL, "key" character varying(64) NOT NULL, "value" text NOT NULL, "type" character varying(16) NOT NULL DEFAULT 'string', "description" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_settings" PRIMARY KEY ("id"))`);
      await queryRunner.query(`CREATE UNIQUE INDEX "IDX_settings_key" ON "settings" ("key") `);
      return;
    }

    await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "key" varchar(64) NOT NULL, "value" text NOT NULL, "type" varchar(16) NOT NULL DEFAULT ('string'), "description" varchar(255), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_settings_key" ON "settings" ("key") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`DROP INDEX "IDX_settings_key"`);
      await queryRunner.query(`DROP TABLE "settings"`);
      return;
    }
    await queryRunner.query(`DROP INDEX "IDX_settings_key"`);
    await queryRunner.query(`DROP TABLE "settings"`);
  }
}

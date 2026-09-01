// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A2：ai_daily_usage 表——AI 每日用量计数独立于审计粒度（HS-9 off/write 不关限额）。
 * (user_id, usage_date) 唯一，sqlite + postgres 双驱动。
 */
export class AddAiDailyUsage1786792000000 implements MigrationInterface {
  name = 'AddAiDailyUsage1786792000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `CREATE TABLE "ai_daily_usage" ("id" SERIAL NOT NULL, "user_id" character varying NOT NULL, "usage_date" character varying(10) NOT NULL, "count" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_1a2b3c4d5e6f7a8b9c0d1e2f3a4b" UNIQUE ("user_id", "usage_date"), CONSTRAINT "PK_1a2b3c4d5e6f7a8b9c0d1e2f3a4b" PRIMARY KEY ("id"))`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_5f6a7b8c9d0e1f2a3b4c5d6e7f8a" ON "ai_daily_usage" ("user_id", "usage_date")`,
      );
    } else {
      await queryRunner.query(
        `CREATE TABLE "ai_daily_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "usage_date" varchar(10) NOT NULL, "count" integer NOT NULL DEFAULT 0, CONSTRAINT "UQ_1a2b3c4d5e6f7a8b9c0d1e2f3a4b" UNIQUE ("user_id", "usage_date"))`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_5f6a7b8c9d0e1f2a3b4c5d6e7f8a" ON "ai_daily_usage" ("user_id", "usage_date")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_daily_usage"`);
  }
}

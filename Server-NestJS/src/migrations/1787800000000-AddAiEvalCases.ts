// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/** AI-20 评测集：ai_eval_cases 表（sqlite + postgres 双驱动）。 */
export class AddAiEvalCases1787800000000 implements MigrationInterface {
  name = 'AddAiEvalCases1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "ai_eval_cases" ("id" SERIAL NOT NULL, "category" character varying(64) NOT NULL, "prompt" text NOT NULL, "expected" text, "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ai_eval_cases" PRIMARY KEY ("id"))`);
      return;
    }
    await queryRunner.query(`CREATE TABLE "ai_eval_cases" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "category" varchar(64) NOT NULL, "prompt" text NOT NULL, "expected" text, "enabled" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_eval_cases"`);
  }
}

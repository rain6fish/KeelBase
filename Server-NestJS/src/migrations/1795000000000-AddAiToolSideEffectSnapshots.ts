// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E-1 字段级变更审计：ai_tool_side_effects 加 before_snapshot / after_snapshot。
 * postgres 简单 ALTER；sqlite 表重建（当前所有列 + 2 新列，保留唯一约束）。
 * 快照不入审计哈希链（副作用表本身不参与哈希链，纯展示/证据包内容）。
 */
export class AddAiToolSideEffectSnapshots1795000000000 implements MigrationInterface {
  name = 'AddAiToolSideEffectSnapshots1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "before_snapshot" text`);
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "after_snapshot" text`);
      return;
    }
    await queryRunner.query(
      `CREATE TABLE "temporary_ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(16) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at" FROM "ai_tool_side_effects"`,
    );
    await queryRunner.query(`DROP TABLE "ai_tool_side_effects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_ai_tool_side_effects" RENAME TO "ai_tool_side_effects"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "before_snapshot"`);
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "after_snapshot"`);
      return;
    }
    await queryRunner.query(
      `CREATE TABLE "temporary_ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(16) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at" FROM "ai_tool_side_effects"`,
    );
    await queryRunner.query(`DROP TABLE "ai_tool_side_effects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_ai_tool_side_effects" RENAME TO "ai_tool_side_effects"`,
    );
  }
}

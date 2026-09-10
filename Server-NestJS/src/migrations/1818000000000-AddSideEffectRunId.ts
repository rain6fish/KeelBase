// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * docs/revoke-contract.spec.md §4 G1：run 级批量撤销前置——副作用记 run_id（KB-5 run 一次性授权的 id）。
 * 链外注解列：不入 G-3 副作用哈希链 payload（_chainPayload 白名单），加列不破历史链。
 *
 * 时间戳 1818000000000 必须晚于 1817000000000（AddToolEffectConversationIndex）：sqlite 加列走
 * 「临时表重建 + RENAME」，若早于后续对同表的迁移，重建会在那些列尚未存在时 SELECT 它们而失败，
 * 且会抹掉其后建的索引。此处晚于全部触碰 ai_tool_side_effects 的迁移，重建时连同 1817 的
 * conversation_id 索引一并携带重建。
 */
export class AddSideEffectRunId1818000000000 implements MigrationInterface {
  name = 'AddSideEffectRunId1818000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "run_id" varchar(64)`);
      return;
    }
    // sqlite：加列需整表重建（保留既有行 + 重建 1817 建的 conversation_id 索引）
    await queryRunner.query(`DROP INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83"`);
    await queryRunner.query(`CREATE TABLE "temporary_ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(64) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, "prev_hash" varchar(64), "hash" varchar(64), "revoke_class" varchar(32), "revoke_status" varchar(32), "run_id" varchar(64), CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`);
    await queryRunner.query(`INSERT INTO "temporary_ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status" FROM "ai_tool_side_effects"`);
    await queryRunner.query(`DROP TABLE "ai_tool_side_effects"`);
    await queryRunner.query(`ALTER TABLE "temporary_ai_tool_side_effects" RENAME TO "ai_tool_side_effects"`);
    await queryRunner.query(`CREATE INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83" ON "ai_tool_side_effects" ("conversation_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "run_id"`);
      return;
    }
    await queryRunner.query(`DROP INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83"`);
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" RENAME TO "temporary_ai_tool_side_effects"`);
    await queryRunner.query(`CREATE TABLE "ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(64) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, "prev_hash" varchar(64), "hash" varchar(64), "revoke_class" varchar(32), "revoke_status" varchar(32), CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`);
    await queryRunner.query(`INSERT INTO "ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status" FROM "temporary_ai_tool_side_effects"`);
    await queryRunner.query(`DROP TABLE "temporary_ai_tool_side_effects"`);
    await queryRunner.query(`CREATE INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83" ON "ai_tool_side_effects" ("conversation_id") `);
  }
}

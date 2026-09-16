// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * docs/cascade-compensation.spec.md §4：级联补偿前置——副作用行加「补偿组」引用。
 * 一次复合写工具调用跨表写多行时，这些行共享同一 compensation_group，撤销任一条即补偿整组。
 * - compensation_group：该次调用的**幂等基键**（sha256(userId:conversationId:toolName:stableArgs)），
 *   故重试天然映射到同一组，无需另生成 uuid。null = 历史/单目标副作用行（行为不变）。
 * - parent_effect_id：组内根成员（主体业务对象）的 effect id。null = 该行即根成员，或单目标行。
 *
 * 两列均为**链外注解列**：不入 G-3 副作用哈希链 _chainPayload 白名单（_chainPayload 是白名单，
 * 旧行按旧 canonical 哈希，加 key 会使全部链化行验链失败）。
 *
 * 时间戳 1823000000000 晚于 1822000000000（最新既有迁移），且晚于全部触碰 ai_tool_side_effects 的迁移：
 * sqlite 加列走「临时表重建 + RENAME」，必须晚于后续迁移，否则会在那些列尚未存在时 SELECT 它们而失败，
 * 且会抹掉其后建的索引。重建时连同 1817 的 conversation_id 索引与本表唯一约束一并携带。
 */
export class AddSideEffectCompensationGroup1823000000000 implements MigrationInterface {
  name = 'AddSideEffectCompensationGroup1823000000000';

  /** 索引名显式固定（不用 TypeORM 派生 hash 名）：手写迁移与实体 @Index 名一致 → 无实体↔迁移漂移 */
  private static readonly GROUP_INDEX = 'IDX_ai_tool_side_effects_compensation_group';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "ai_tool_side_effects" ADD "compensation_group" varchar(64)`,
      );
      await queryRunner.query(
        `ALTER TABLE "ai_tool_side_effects" ADD "parent_effect_id" integer`,
      );
      await queryRunner.query(
        `CREATE INDEX "${AddSideEffectCompensationGroup1823000000000.GROUP_INDEX}" ON "ai_tool_side_effects" ("compensation_group")`,
      );
      return;
    }
    // sqlite：加列需整表重建（保留既有行 + 重建 1817 的 conversation_id 索引与唯一约束）
    await queryRunner.query(`DROP INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(64) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, "prev_hash" varchar(64), "hash" varchar(64), "revoke_class" varchar(32), "revoke_status" varchar(32), "run_id" varchar(64), "compensation_group" varchar(64), "parent_effect_id" integer, CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status", "run_id") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status", "run_id" FROM "ai_tool_side_effects"`,
    );
    await queryRunner.query(`DROP TABLE "ai_tool_side_effects"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_ai_tool_side_effects" RENAME TO "ai_tool_side_effects"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83" ON "ai_tool_side_effects" ("conversation_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "${AddSideEffectCompensationGroup1823000000000.GROUP_INDEX}" ON "ai_tool_side_effects" ("compensation_group") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`DROP INDEX "${AddSideEffectCompensationGroup1823000000000.GROUP_INDEX}"`);
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "parent_effect_id"`);
      await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "compensation_group"`);
      return;
    }
    await queryRunner.query(`DROP INDEX "${AddSideEffectCompensationGroup1823000000000.GROUP_INDEX}"`);
    await queryRunner.query(`DROP INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83"`);
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" RENAME TO "temporary_ai_tool_side_effects"`,
    );
    await queryRunner.query(
      `CREATE TABLE "ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(64) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, "prev_hash" varchar(64), "hash" varchar(64), "revoke_class" varchar(32), "revoke_status" varchar(32), "run_id" varchar(64), CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`,
    );
    await queryRunner.query(
      `INSERT INTO "ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status", "run_id") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot", "prev_hash", "hash", "revoke_class", "revoke_status", "run_id" FROM "temporary_ai_tool_side_effects"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_ai_tool_side_effects"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_a7fd30a8bc01dcc1cc89f63d83" ON "ai_tool_side_effects" ("conversation_id") `,
    );
  }
}
